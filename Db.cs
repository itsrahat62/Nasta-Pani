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

IF OBJECT_ID(N'dbo.day_status', N'U') IS NULL
CREATE TABLE dbo.day_status (
  day        NVARCHAR(10)  PRIMARY KEY,
  status     NVARCHAR(20)  NOT NULL CONSTRAINT DF_ds_status DEFAULT 'open',
  message    NVARCHAR(200) NOT NULL CONSTRAINT DF_ds_msg DEFAULT N'',
  updated_by INT NULL,
  updated_at NVARCHAR(20)  NOT NULL,
  version    INT NOT NULL CONSTRAINT DF_ds_ver DEFAULT 1
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_orders_date' AND object_id = OBJECT_ID(N'dbo.orders'))
CREATE INDEX IX_orders_date ON dbo.orders(order_date);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_lines_order' AND object_id = OBJECT_ID(N'dbo.order_lines'))
CREATE INDEX IX_lines_order ON dbo.order_lines(order_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ledger_user' AND object_id = OBJECT_ID(N'dbo.ledger'))
CREATE INDEX IX_ledger_user ON dbo.ledger(user_id);
";

    private static void EnsureSchema()
    {
        using var c = Open();
        foreach (var batch in SCHEMA.Split("\nGO", StringSplitOptions.RemoveEmptyEntries))
            c.Execute(batch);
    }

    // ---------------------------------------------------------- সেটিংস
    public static readonly Dictionary<string, string> DefaultSettings = new()
    {
        ["office_name"]  = "আমাদের অফিস",
        ["register_pin"] = "1234",
        ["cutoff_time"]  = "09:30",
        ["money_module"] = "1",
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
            c.Execute(
                "INSERT INTO dbo.users(name, password_hash, role, created_at) VALUES(@n, @p, 'super_admin', @t)",
                new { n = "admin", p = BCrypt.Net.BCrypt.HashPassword("123456"), t = Stamp() });
            Console.WriteLine("✅ প্রথম অ্যাডমিন — নাম: admin / পাসওয়ার্ড: 123456");
        }

        if (c.ExecuteScalar<int>("SELECT COUNT(*) FROM dbo.items") == 0)
        {
            (string name, decimal price, string cat, (string n, decimal d)[] opts)[] seed =
            {
                ("সিঙ্গারা",   10, "নাস্তা", Array.Empty<(string, decimal)>()),
                ("সমুচা",      12, "নাস্তা", Array.Empty<(string, decimal)>()),
                ("পুরি",        8, "নাস্তা", Array.Empty<(string, decimal)>()),
                ("পরোটা",      15, "নাস্তা", Array.Empty<(string, decimal)>()),
                ("ডাল",        20, "নাস্তা", Array.Empty<(string, decimal)>()),
                ("সবজি ভাজি",  25, "নাস্তা", Array.Empty<(string, decimal)>()),
                ("ডিম",        25, "নাস্তা", new[] { ("ভাজি", 0m), ("পোচ", 0m), ("সিদ্ধ", 0m), ("ওমলেট", 5m) }),
                ("চা",         10, "পানীয়", new[] { ("দুধ চা", 0m), ("রঙ চা", -3m), ("চিনি ছাড়া", 0m) }),
                ("কফি",        20, "পানীয়", Array.Empty<(string, decimal)>()),
                ("পানি (৫০০ মি.লি.)", 20, "পানীয়", Array.Empty<(string, decimal)>()),
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
                        "INSERT INTO dbo.item_options(item_id, name, price_delta, sort_order) VALUES(@i, @n, @d, @s)",
                        new { i = id, n = s.opts[j].n, d = s.opts[j].d, s = (j + 1) * 10 });
            }
            Console.WriteLine("✅ ডেমো মেনু যোগ হলো");
        }
    }
}
