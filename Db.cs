using System.Data;
using Dapper;
using Microsoft.Data.SqlClient;

namespace NastaOrder;

/// <summary>ডেটাবেজ কানেকশন, টেবিল তৈরি, সেটিংস ও শুরুর ডেটা।</summary>
public static class Db
{
    private static string _cs = "";

    public static void Init(string connectionString)
    {
        _cs = connectionString;
        EnsureSchema();
        Seed();
    }

    public static IDbConnection Open()
    {
        var c = new SqlConnection(_cs);
        c.Open();
        return c;
    }

    // ---------------------------------------------------------- সময় (ঢাকা)
    public static DateTimeOffset Now() => DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(6));
    public static string Today() => Now().ToString("yyyy-MM-dd");
    public static string NowTime() => Now().ToString("HH:mm");
    public static string Stamp() => Now().ToString("yyyy-MM-dd HH:mm:ss");

    // ---------------------------------------------------------- টেবিল
    private const string SCHEMA = @"
IF OBJECT_ID(N'dbo.users', N'U') IS NULL
CREATE TABLE dbo.users (
  id            INT IDENTITY(1,1) PRIMARY KEY,
  name          NVARCHAR(100)  NOT NULL,
  pin           NVARCHAR(20)   NULL,          -- প্রত্যেকের আলাদা; এটা দিয়েই লগইন
  floor         INT            NULL,          -- কোন তলার; সুপার অ্যাডমিনের জন্য NULL = সব তলা
  default_shop_id INT          NULL,          -- শেষবার যে দোকান থেকে নিয়েছিলেন
  usual_json    NVARCHAR(MAX)  NULL,          -- রোজকার বাঁধা অর্ডার (এক চাপে বসে যায়)
  password_hash NVARCHAR(200)  NOT NULL,
  role          NVARCHAR(20)   NOT NULL CONSTRAINT DF_users_role DEFAULT 'user',
  active        BIT            NOT NULL CONSTRAINT DF_users_active DEFAULT 1,
  created_at    NVARCHAR(20)   NOT NULL
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_users_name' AND object_id = OBJECT_ID(N'dbo.users'))
CREATE UNIQUE INDEX UX_users_name ON dbo.users(name);

IF OBJECT_ID(N'dbo.sessions', N'U') IS NULL
CREATE TABLE dbo.sessions (
  token      NVARCHAR(64) PRIMARY KEY,
  user_id    INT NOT NULL,
  created_at NVARCHAR(20) NOT NULL
);

IF OBJECT_ID(N'dbo.items', N'U') IS NULL
CREATE TABLE dbo.items (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  name       NVARCHAR(100)  NOT NULL,
  price      DECIMAL(10,2)  NOT NULL CONSTRAINT DF_items_price DEFAULT 0,
  category   NVARCHAR(60)   NOT NULL CONSTRAINT DF_items_cat DEFAULT N'নাস্তা',
  available  BIT            NOT NULL CONSTRAINT DF_items_avail DEFAULT 1,
  active     BIT            NOT NULL CONSTRAINT DF_items_active DEFAULT 1,
  sort_order INT            NOT NULL CONSTRAINT DF_items_sort DEFAULT 100
);

IF OBJECT_ID(N'dbo.item_options', N'U') IS NULL
CREATE TABLE dbo.item_options (
  id          INT IDENTITY(1,1) PRIMARY KEY,
  item_id     INT NOT NULL,
  name        NVARCHAR(60)  NOT NULL,
  price_delta DECIMAL(10,2) NOT NULL CONSTRAINT DF_opt_delta DEFAULT 0,
  sort_order  INT           NOT NULL CONSTRAINT DF_opt_sort DEFAULT 100
);

-- যে দোকান/হোটেল থেকে আনা হয় (স্টার, প্রিন্স হোটেল…)
IF OBJECT_ID(N'dbo.shops', N'U') IS NULL
CREATE TABLE dbo.shops (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  name       NVARCHAR(100) NOT NULL,
  active     BIT NOT NULL CONSTRAINT DF_shop_active DEFAULT 1,
  sort_order INT NOT NULL CONSTRAINT DF_shop_sort DEFAULT 100
);

-- একই জিনিসের দোকানভেদে দাম; এখানে না থাকলে items.price ধরা হয়
IF OBJECT_ID(N'dbo.item_prices', N'U') IS NULL
CREATE TABLE dbo.item_prices (
  item_id   INT NOT NULL,
  shop_id   INT NOT NULL,
  price     DECIMAL(10,2) NOT NULL,
  available BIT NOT NULL CONSTRAINT DF_ip_avail DEFAULT 1,   -- 0 = এই দোকানে এটা পাওয়া যায় না
  CONSTRAINT PK_item_prices PRIMARY KEY (item_id, shop_id)
);

IF OBJECT_ID(N'dbo.orders', N'U') IS NULL
CREATE TABLE dbo.orders (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  user_id    INT           NOT NULL,
  order_date NVARCHAR(10)  NOT NULL,
  status     NVARCHAR(20)  NOT NULL CONSTRAINT DF_ord_status DEFAULT 'pending',
  note       NVARCHAR(400) NOT NULL CONSTRAINT DF_ord_note DEFAULT N'',
  total      DECIMAL(10,2) NOT NULL CONSTRAINT DF_ord_total DEFAULT 0,
  created_at NVARCHAR(20)  NOT NULL,
  updated_at NVARCHAR(20)  NOT NULL
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_orders_user_date' AND object_id = OBJECT_ID(N'dbo.orders'))
CREATE UNIQUE INDEX UX_orders_user_date ON dbo.orders(user_id, order_date);

IF OBJECT_ID(N'dbo.order_lines', N'U') IS NULL
CREATE TABLE dbo.order_lines (
  id               INT IDENTITY(1,1) PRIMARY KEY,
  order_id         INT NOT NULL,
  item_id          INT NULL,
  item_name        NVARCHAR(100) NOT NULL,
  option_id        INT NULL,
  option_name      NVARCHAR(60)  NOT NULL CONSTRAINT DF_ln_opt DEFAULT N'',
  unit_price       DECIMAL(10,2) NOT NULL CONSTRAINT DF_ln_unit DEFAULT 0,
  qty              INT           NOT NULL CONSTRAINT DF_ln_qty DEFAULT 1,
  subtotal         DECIMAL(10,2) NOT NULL CONSTRAINT DF_ln_sub DEFAULT 0,
  fallback_type    NVARCHAR(20)  NOT NULL CONSTRAINT DF_ln_fbt DEFAULT 'skip',
  fallback_item_id INT NULL,
  fallback_name    NVARCHAR(100) NOT NULL CONSTRAINT DF_ln_fbn DEFAULT N'',
  fallback_note    NVARCHAR(200) NOT NULL CONSTRAINT DF_ln_fbnote DEFAULT N''
);

IF OBJECT_ID(N'dbo.ledger', N'U') IS NULL
CREATE TABLE dbo.ledger (
  id           INT IDENTITY(1,1) PRIMARY KEY,
  user_id      INT           NOT NULL,
  type         NVARCHAR(20)  NOT NULL,
  amount       DECIMAL(10,2) NOT NULL,
  note         NVARCHAR(200) NOT NULL CONSTRAINT DF_lg_note DEFAULT N'',
  ref_order_id INT NULL,
  created_by   INT NULL,
  created_at   NVARCHAR(20)  NOT NULL
);

IF OBJECT_ID(N'dbo.settings', N'U') IS NULL
CREATE TABLE dbo.settings (
  [key] NVARCHAR(60) PRIMARY KEY,
  value NVARCHAR(200) NOT NULL
);

-- প্রতি তলার নিজের অবস্থা — একই দিনে ২য় তলা আর ৩য় তলার খবর আলাদা
IF OBJECT_ID(N'dbo.day_status', N'U') IS NULL
CREATE TABLE dbo.day_status (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  floor      INT           NOT NULL CONSTRAINT DF_ds_floor DEFAULT 0,
  day        NVARCHAR(10)  NOT NULL,
  status     NVARCHAR(20)  NOT NULL CONSTRAINT DF_ds_status DEFAULT 'open',
  message    NVARCHAR(200) NOT NULL CONSTRAINT DF_ds_msg DEFAULT N'',
  updated_by INT NULL,
  updated_at NVARCHAR(20)  NOT NULL,
  version    INT NOT NULL CONSTRAINT DF_ds_ver DEFAULT 1
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_orders_date' AND object_id = OBJECT_ID(N'dbo.orders'))
CREATE INDEX IX_orders_date ON dbo.orders(order_date);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_day_status' AND object_id = OBJECT_ID(N'dbo.day_status'))
CREATE UNIQUE INDEX UX_day_status ON dbo.day_status(day, floor);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_lines_order' AND object_id = OBJECT_ID(N'dbo.order_lines'))
CREATE INDEX IX_lines_order ON dbo.order_lines(order_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ledger_user' AND object_id = OBJECT_ID(N'dbo.ledger'))
CREATE INDEX IX_ledger_user ON dbo.ledger(user_id);
";

    /// <summary>পুরোনো ডেটাবেজেও নতুন কলাম/ইনডেক্স যোগ করে (বারবার চালালেও সমস্যা নেই)।</summary>
    private static readonly string[] MIGRATIONS =
    {
        // প্রত্যেকের আলাদা PIN — এটা দিয়েই লগইন
        "IF COL_LENGTH('dbo.users', 'pin') IS NULL ALTER TABLE dbo.users ADD pin NVARCHAR(20) NULL;",
        "UPDATE dbo.users SET pin = CAST(1000 + id AS NVARCHAR(20)) WHERE pin IS NULL;",
        @"IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_users_pin' AND object_id = OBJECT_ID(N'dbo.users'))
          CREATE UNIQUE INDEX UX_users_pin ON dbo.users(pin) WHERE pin IS NOT NULL;",
        // অফিস-জোড়া রেজিস্ট্রেশন PIN আর লাগে না
        "DELETE FROM dbo.settings WHERE [key] = 'register_pin';",

        // কিছু না বাছলে কোন রকমটা ধরা হবে (যেমন পরোটা → তেল দিয়ে)
        @"IF COL_LENGTH('dbo.item_options', 'is_default') IS NULL
          ALTER TABLE dbo.item_options ADD is_default BIT NOT NULL CONSTRAINT DF_opt_default DEFAULT 0;",

        // অর্ডার কোন দোকান থেকে
        "IF COL_LENGTH('dbo.orders', 'shop_id') IS NULL ALTER TABLE dbo.orders ADD shop_id INT NULL;",
        @"IF COL_LENGTH('dbo.orders', 'shop_name') IS NULL
          ALTER TABLE dbo.orders ADD shop_name NVARCHAR(100) NOT NULL CONSTRAINT DF_ord_shop DEFAULT N'';",

        // ---- তলা (floor) ----
        "IF COL_LENGTH('dbo.users', 'floor') IS NULL ALTER TABLE dbo.users ADD floor INT NULL;",

        // কোনো জিনিস কোনো দোকানে নেই — সেটা এখানে বলা থাকে
        @"IF COL_LENGTH('dbo.item_prices', 'available') IS NULL
          ALTER TABLE dbo.item_prices ADD available BIT NOT NULL CONSTRAINT DF_ip_avail_mig DEFAULT 1;",

        // ---- ক্লিক কমাতে: শেষবার যে দোকান, আর রোজকার বাঁধা অর্ডার ----
        "IF COL_LENGTH('dbo.users', 'default_shop_id') IS NULL ALTER TABLE dbo.users ADD default_shop_id INT NULL;",
        "IF COL_LENGTH('dbo.users', 'usual_json') IS NULL ALTER TABLE dbo.users ADD usual_json NVARCHAR(MAX) NULL;",
        @"IF COL_LENGTH('dbo.day_status', 'floor') IS NULL
          ALTER TABLE dbo.day_status ADD floor INT NOT NULL CONSTRAINT DF_ds_floor_mig DEFAULT 0;",
        // পুরোনো day_status-এ day ছিল প্রাইমারি কি — এখন (day, floor) মিলে ইউনিক
        @"DECLARE @pk NVARCHAR(200);
          SELECT @pk = kc.name
            FROM sys.key_constraints kc
           WHERE kc.parent_object_id = OBJECT_ID(N'dbo.day_status') AND kc.type = 'PK'
             AND EXISTS (SELECT 1 FROM sys.index_columns ic
                           JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
                          WHERE ic.object_id = kc.parent_object_id
                            AND ic.index_id = kc.unique_index_id AND c.name = 'day');
          IF @pk IS NOT NULL EXEC('ALTER TABLE dbo.day_status DROP CONSTRAINT [' + @pk + ']');",
        @"IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_day_status' AND object_id = OBJECT_ID(N'dbo.day_status'))
          CREATE UNIQUE INDEX UX_day_status ON dbo.day_status(day, floor);",
    };

    private static void EnsureSchema()
    {
        using var c = Open();
        foreach (var batch in SCHEMA.Split("\nGO", StringSplitOptions.RemoveEmptyEntries))
            c.Execute(batch);
        foreach (var m in MIGRATIONS) c.Execute(m);
    }

    // ---------------------------------------------------------- সেটিংস
    public static readonly Dictionary<string, string> DefaultSettings = new()
    {
        ["office_name"]    = "আমাদের অফিস",
        ["money_module"]   = "1",
        ["allow_register"] = "1",         // নতুন কেউ নিজে রেজিস্ট্রেশন করতে পারবে কি না
        ["floors"]         = "2,3,4,5",   // অফিসের যে তলাগুলো আছে
    };

    public static Dictionary<string, string> GetSettings()
    {
        using var c = Open();
        var rows = c.Query<(string key, string value)>("SELECT [key], value FROM dbo.settings");
        var d = new Dictionary<string, string>(DefaultSettings);
        foreach (var r in rows) d[r.key] = r.value;
        return d;
    }

    public static void SaveSettings(IDictionary<string, string> patch)
    {
        using var c = Open();
        foreach (var kv in patch)
            c.Execute(
                @"UPDATE dbo.settings SET value = @v WHERE [key] = @k;
                  IF @@ROWCOUNT = 0 INSERT INTO dbo.settings([key], value) VALUES(@k, @v);",
                new { k = kv.Key, v = kv.Value });
    }

    // ---------------------------------------------------------- শুরুর ডেটা
    private static void Seed()
    {
        using var c = Open();

        foreach (var kv in DefaultSettings)
            c.Execute(
                "IF NOT EXISTS (SELECT 1 FROM dbo.settings WHERE [key] = @k) INSERT INTO dbo.settings([key], value) VALUES(@k, @v)",
                new { k = kv.Key, v = kv.Value });

        if (c.ExecuteScalar<int>("SELECT COUNT(*) FROM dbo.users") == 0)
        {
            // সুপার অ্যাডমিন — সব তলা দেখতে পান (floor = NULL)
            c.Execute(
                "INSERT INTO dbo.users(name, pin, password_hash, role, floor, created_at) VALUES(@n, @pin, @p, 'super_admin', NULL, @t)",
                new { n = "admin", pin = "1000", p = BCrypt.Net.BCrypt.HashPassword("admin@123"), t = Stamp() });
            Console.WriteLine("✅ সুপার অ্যাডমিন — admin / পাসওয়ার্ড: admin@123");
        }

        // অফিসের স্টাফ — একবারই তৈরি হয়। ইনি নিজে পরে পাসওয়ার্ড বদলে নিতে পারবেন।
        if (c.ExecuteScalar<int>("SELECT COUNT(*) FROM dbo.users WHERE pin = '4800' OR name = N'Yeasin'") == 0)
        {
            c.Execute(
                "INSERT INTO dbo.users(name, pin, password_hash, role, floor, created_at) VALUES(@n, @pin, @p, 'staff', 2, @t)",
                new { n = "Yeasin", pin = "4800", p = BCrypt.Net.BCrypt.HashPassword("1234@4321"), t = Stamp() });
            Console.WriteLine("✅ স্টাফ — Yeasin / PIN: 4800 / পাসওয়ার্ড: 1234@4321 / ২য় তলা");
        }

        if (c.ExecuteScalar<int>("SELECT COUNT(*) FROM dbo.shops") == 0)
        {
            foreach (var (n, i) in new[] { "Hotel Star", "Prince Hotel" }.Select((n, i) => (n, i)))
                c.Execute("INSERT INTO dbo.shops(name, sort_order) VALUES(@n, @s)", new { n, s = (i + 1) * 10 });
            Console.WriteLine("✅ দুটো দোকান যোগ হলো — Hotel Star, Prince Hotel");
        }

        if (c.ExecuteScalar<int>("SELECT COUNT(*) FROM dbo.items") == 0)
        {
            // opts: (নাম, দামের হেরফের, এটাই ডিফল্ট কি না)
            (string name, decimal price, string cat, (string n, decimal d, bool def)[] opts)[] seed =
            {
                ("সিঙ্গারা",   10, "নাস্তা", Array.Empty<(string, decimal, bool)>()),
                ("সমুচা",      12, "নাস্তা", Array.Empty<(string, decimal, bool)>()),
                ("পুরি",        8, "নাস্তা", Array.Empty<(string, decimal, bool)>()),
                ("পরোটা",      15, "নাস্তা", new[] { ("তেল দিয়ে", 0m, true), ("তেল ছাড়া", 0m, false) }),
                ("বুটের ডাল",       20, "ডাল ও ভাজি", Array.Empty<(string, decimal, bool)>()),
                ("ডাল ভাজি মিক্সড", 25, "ডাল ও ভাজি", Array.Empty<(string, decimal, bool)>()),
                ("মুগ ডাল",         22, "ডাল ও ভাজি", Array.Empty<(string, decimal, bool)>()),
                ("সবজি ভাজি",       25, "ডাল ও ভাজি", Array.Empty<(string, decimal, bool)>()),
                ("ডিম",        25, "নাস্তা", new[] { ("ভাজি", 0m, true), ("পোচ", 0m, false), ("সিদ্ধ", 0m, false), ("ওমলেট", 5m, false) }),
                ("চা",         10, "পানীয়", new[] { ("দুধ চা", 0m, true), ("রঙ চা", -3m, false), ("চিনি ছাড়া", 0m, false) }),
                ("কফি",        20, "পানীয়", Array.Empty<(string, decimal, bool)>()),
                ("পানি (৫০০ মি.লি.)", 20, "পানীয়", Array.Empty<(string, decimal, bool)>()),
            };

            for (int i = 0; i < seed.Length; i++)
            {
                var s = seed[i];
                var id = c.ExecuteScalar<int>(
                    @"INSERT INTO dbo.items(name, price, category, sort_order)
                      VALUES(@n, @p, @c, @s); SELECT CAST(SCOPE_IDENTITY() AS INT);",
                    new { n = s.name, p = s.price, c = s.cat, s = (i + 1) * 10 });

                for (int j = 0; j < s.opts.Length; j++)
                    c.Execute(
                        @"INSERT INTO dbo.item_options(item_id, name, price_delta, sort_order, is_default)
                          VALUES(@i, @n, @d, @s, @def)",
                        new { i = id, n = s.opts[j].n, d = s.opts[j].d, s = (j + 1) * 10, def = s.opts[j].def });
            }
            Console.WriteLine("✅ ডেমো মেনু যোগ হলো");
        }
    }
}
