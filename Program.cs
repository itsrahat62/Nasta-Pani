using System.Data;
using System.Globalization;
using System.Security.Cryptography;
using System.Text.Json;
using Dapper;
using Microsoft.AspNetCore.StaticFiles;
using NastaOrder;

var builder = WebApplication.CreateBuilder(args);

builder.Services.ConfigureHttpJsonOptions(o =>
{
    // ফ্রন্টএন্ড snake_case নাম আশা করে — তাই কোনো নাম বদল নয়
    o.SerializerOptions.PropertyNamingPolicy = null;
    o.SerializerOptions.Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping;
});

var app = builder.Build();

// ------------------------------------------------------------- ডেটাবেজ
var cs = Pick(builder.Configuration.GetConnectionString("Default"))
         ?? Pick(Environment.GetEnvironmentVariable("NASTA_DB"))
         ?? throw new InvalidOperationException(
             "ডেটাবেজ কানেকশন স্ট্রিং নেই। appsettings.Production.json অথবা NASTA_DB এনভায়রনমেন্ট ভ্যারিয়েবলে দিন।");
Db.Init(cs);

// ------------------------------------------------------------- স্ট্যাটিক ফাইল
var ctp = new FileExtensionContentTypeProvider();
ctp.Mappings[".webmanifest"] = "application/manifest+json";
app.UseDefaultFiles();
app.UseStaticFiles(new StaticFileOptions { ContentTypeProvider = ctp });

// ------------------------------------------------------------- হেল্পার
const string COOKIE = "nasta_sid";
var bnCompare = StringComparer.Create(new CultureInfo("bn"), ignoreCase: true);

IResult Fail(int code, string msg) => Results.Json(new { error = msg }, statusCode: code);

static string? Pick(string? s) => string.IsNullOrWhiteSpace(s) ? null : s;

static Dictionary<string, object?> D(dynamic row)
{
    var src = (IDictionary<string, object>)row;
    var d = new Dictionary<string, object?>(src.Count);
    foreach (var kv in src) d[kv.Key] = kv.Value;
    return d;
}
static List<Dictionary<string, object?>> DL(IEnumerable<dynamic> rows) => rows.Select(r => D(r)).ToList();
static decimal M(decimal v) => Math.Round(v, 2, MidpointRounding.AwayFromZero);
static bool IsDate(string? s) => !string.IsNullOrEmpty(s) && s.Length == 10 &&
                                 DateTime.TryParseExact(s, "yyyy-MM-dd", CultureInfo.InvariantCulture,
                                     DateTimeStyles.None, out _);

Me? Who(HttpContext ctx)
{
    var token = ctx.Request.Cookies[COOKIE];
    if (string.IsNullOrEmpty(token)) return null;
    using var c = Db.Open();
    var r = c.QueryFirstOrDefault(
        @"SELECT u.id, u.name, u.role, u.active, u.pin, u.floor
            FROM dbo.sessions s JOIN dbo.users u ON u.id = s.user_id
           WHERE s.token = @t", new { t = token });
    if (r is null || !(bool)r.active) return null;
    return new Me((int)r.id, (string)r.name, (string)r.role, (string?)r.pin ?? "", (int?)r.floor);
}

/// <summary>অফিসে যে তলাগুলো আছে।</summary>
List<int> Floors()
{
    var raw = Db.GetSettings().TryGetValue("floors", out var f) ? f : "2,3,4,5";
    var list = raw.Split(',', StringSplitOptions.RemoveEmptyEntries)
        .Select(x => int.TryParse(x.Trim(), out var n) ? n : 0)
        .Where(n => n > 0).Distinct().OrderBy(n => n).ToList();
    return list.Count > 0 ? list : new List<int> { 2, 3, 4, 5 };
}

/// <summary>
/// কোন তলার ডেটা দেখা যাবে। স্টাফ/ইউজার শুধু নিজের তলা; সুপার অ্যাডমিন চাইলে
/// একটা তলা বেছে নিতে পারেন, না বাছলে সব তলা (null)।
/// </summary>
int? ScopeFloor(Me me, string? requested)
{
    if (me.role != "super_admin") return me.floor;
    return int.TryParse(requested, out var f) && f > 0 ? f : null;
}

/// <summary>স্টাফ অন্য তলার কারো ব্যাপারে কিছু করতে পারবেন না।</summary>
IResult? NotMyFloor(Me me, int userId)
{
    if (me.role != "staff" || me.floor is null) return null;
    using var c = Db.Open();
    var f = c.ExecuteScalar<int?>("SELECT floor FROM dbo.users WHERE id = @i", new { i = userId });
    return f == me.floor ? null : Fail(403, "ইনি আপনার তলার নন");
}

(Me?, IResult?) Auth(HttpContext ctx, string need = "any")
{
    var me = Who(ctx);
    if (me is null) return (null, Fail(401, "লগইন করুন"));
    if (need == "staff" && me.role is not ("staff" or "super_admin"))
        return (null, Fail(403, "এই কাজের অনুমতি নেই"));
    if (need == "admin" && me.role != "super_admin")
        return (null, Fail(403, "শুধু সুপার অ্যাডমিন পারবে"));
    return (me, null);
}

void StartSession(HttpContext ctx, int userId)
{
    var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(24)).ToLowerInvariant();
    using var c = Db.Open();
    c.Execute("INSERT INTO dbo.sessions(token, user_id, created_at) VALUES(@t, @u, @c)",
        new { t = token, u = userId, c = Db.Stamp() });
    ctx.Response.Cookies.Append(COOKIE, token, new CookieOptions
    {
        HttpOnly = true,
        SameSite = SameSiteMode.Lax,
        Secure = ctx.Request.IsHttps,
        Path = "/",
        MaxAge = TimeSpan.FromDays(60),
    });
}

// ------------------------------------------------- দিনের অবস্থা (সবার জন্য)
// অর্ডারের কোনো "শেষ সময়" নেই — স্টাফ বন্ধ করলেও অর্ডার করা যায়,
// শুধু জানিয়ে দেওয়া হয় যে একটু দেরি হতে পারে।
// lateMsg-এ অবস্থাটা আর লেখা হয় না — ওটা ঠিক উপরের label-এই আছে। আগে দুটোই
// পাশাপাশি দেখানো হতো, ফলে পর্দার মাথায় পড়তে হতো "অর্ডার নেওয়া বন্ধ" আর তার
// নিচেই "অর্ডার নেওয়া বন্ধ হয়ে গেছে — তবুও..."। এখন শুধু নতুন কথাটুকু।
const string LATE = "তবুও অর্ডার করলে একটু সময় লাগতে পারে";
var DAY_STATUS = new Dictionary<string, object>
{
    ["open"] = new { label = "অর্ডার নেওয়া হচ্ছে", icon = "🟢", tone = "ok", canOrder = true,
                     late = false, lateMsg = "" },
    ["closed"] = new { label = "অর্ডার নেওয়া বন্ধ", icon = "🔴", tone = "warn", canOrder = true,
                       late = true, lateMsg = LATE },
    ["buying"] = new { label = "বাজারে যাওয়া হয়েছে", icon = "🛵", tone = "info", canOrder = true,
                       late = true, lateMsg = LATE },
    ["arrived"] = new { label = "নাস্তা চলে এসেছে", icon = "📦", tone = "info", canOrder = true,
                        late = true, lateMsg = LATE },
    ["served"] = new { label = "নাস্তা পরিবেশন করা হয়েছে", icon = "✅", tone = "ok", canOrder = true,
                       late = true, lateMsg = LATE },
    ["off"] = new { label = "আজ নাস্তা নেই", icon = "🚫", tone = "warn", canOrder = false,
                    late = false, lateMsg = "" },
};
var STATUS_META = DAY_STATUS.ToDictionary(
    kv => kv.Key,
    kv => JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(JsonSerializer.Serialize(kv.Value))!);

Dictionary<string, object?>? DayStatus(string date, int? floor)
{
    if (floor is null) return null;   // সব তলা একসাথে দেখলে কোনো একটা অবস্থা দেখানো যায় না
    using var c = Db.Open();
    var row = c.QueryFirstOrDefault("SELECT * FROM dbo.day_status WHERE day = @d AND floor = @f",
        new { d = date, f = floor });
    if (row is null) return null;
    var d = D(row);
    var key = (string)d["status"]!;
    var meta = STATUS_META.TryGetValue(key, out var m) ? m : STATUS_META["open"];
    d["key"] = key;
    d["label"] = meta["label"].GetString();
    d["icon"] = meta["icon"].GetString();
    d["tone"] = meta["tone"].GetString();
    d["canOrder"] = meta["canOrder"].GetBoolean();
    d["late"] = meta["late"].GetBoolean();
    d["lateMsg"] = meta["lateMsg"].GetString();
    return d;
}

/// <summary>
/// ইউজার এখন অর্ডার বদলাতে পারবে কি না। সময়ের কোনো সীমা নেই।
/// <para>
/// একবার অর্ডার দিয়ে দিলে ইউজার নিজে আর সেটা বদলাতে বা বাতিল করতে পারেন না —
/// স্টাফ ওই তালিকা ধরেই বাজারে যান, তাই পরে বদলে গেলে হিসাব মেলে না।
/// কিছু বদলাতে হলে স্টাফকে বলতে হবে; স্টাফ/অ্যাডমিন সবসময়ই বদলাতে পারেন।
/// </para>
/// </summary>
bool OrderLocked(dynamic? order, Me me, string date)
{
    if (me.role != "user") return false;
    // বাতিল হওয়া অর্ডার মানে আজ আর কোনো অর্ডার নেই — আবার নতুন করে দেওয়া যায়
    if (order is not null && (string)order.status != "cancelled") return true;
    var st = DayStatus(date, me.floor);
    return st is not null && !(bool)st["canOrder"]!;
}

string LockReason(string date, int? floor, dynamic? order = null)
{
    if (order is not null)
    {
        string s = (string)order.status;
        if (s == "purchased") return "🛍️ আপনার নাস্তা কেনা হয়ে গেছে — আর বদলানো যাবে না";
        if (s == "delivered") return "✅ নাস্তা বুঝিয়ে দেওয়া হয়েছে — আর বদলানো যাবে না";
        if (s == "cancelled") return "🚫 এই অর্ডারটি বাতিল করা হয়েছে — স্টাফকে বলুন";
        // জমা হয়ে গেছে, কিন্তু স্টাফ এখনো কিছু করেননি
        return "🔒 আপনার অর্ডার জমা হয়ে গেছে — নিজে আর বদলানো বা বাতিল করা যাবে না। "
             + "কিছু বদলাতে হলে আপনার তলার স্টাফকে বলুন।";
    }
    var st = DayStatus(date, floor);
    if (st is not null && !(bool)st["canOrder"]!) return $"{st["icon"]} {st["label"]}";
    return "";
}

/// <summary>
/// দেরি হয়ে গেলে ইউজারকে যে কথাটা দেখানো হবে (অর্ডার তবু করা যাবে)।
/// আগে সামনে আইকনটাও জোড়া হতো, কিন্তু কথাটা এখন যে ব্যানারের ছোট লাইনে বসে
/// সেই ব্যানারেই আইকনটা আছে — তাই দুবার দেখানোর মানে হয় না।
/// </summary>
string LateNote(string date, int? floor)
{
    var st = DayStatus(date, floor);
    return st is not null && (bool)st["late"]! ? (string)st["lateMsg"]! : "";
}

// ------------------------------------------------------------- আইটেম লোড
List<Dictionary<string, object?>> LoadItems(bool onlyActive)
{
    using var c = Db.Open();
    var items = DL(c.Query(
        $"SELECT * FROM dbo.items {(onlyActive ? "WHERE active = 1" : "")} ORDER BY sort_order, id"));
    var opts = DL(c.Query("SELECT * FROM dbo.item_options ORDER BY sort_order, id"));
    var prices = DL(c.Query("SELECT * FROM dbo.item_prices"));
    foreach (var it in items)
    {
        var id = (int)it["id"]!;
        it["options"] = opts.Where(o => (int)o["item_id"]! == id).ToList();
        // { "3": 18.00 } — দোকান-আইডি ধরে দাম। এই তালিকায় যে দোকান নেই,
        // ওই দোকানে জিনিসটা পাওয়াই যায় না। সাধারণ দাম বলে কিছু নেই।
        it["shop_prices"] = prices
            .Where(p => (int)p["item_id"]! == id && (decimal)p["price"]! > 0)
            .ToDictionary(p => p["shop_id"]!.ToString()!, p => (decimal)p["price"]!);
    }
    return items;
}

/// <summary>এই দোকানে জিনিসটা পাওয়া যায় কি না — দাম বসানো থাকলেই পাওয়া যায়।</summary>
bool SoldAt(Dictionary<string, object?> item, int? shopId) =>
    shopId is int sid &&
    item["shop_prices"] is Dictionary<string, decimal> sp &&
    sp.ContainsKey(sid.ToString());

List<Dictionary<string, object?>> LoadShops(bool onlyActive = true)
{
    using var c = Db.Open();
    return DL(c.Query(
        $"SELECT * FROM dbo.shops {(onlyActive ? "WHERE active = 1" : "")} ORDER BY sort_order, id"));
}

/// <summary>এই দোকানে এই জিনিসের দাম। দোকানে দাম বসানো না থাকলে জিনিসটা ওখানে নেই।</summary>
decimal PriceOf(Dictionary<string, object?> item, int? shopId)
{
    if (shopId is int sid &&
        item["shop_prices"] is Dictionary<string, decimal> sp &&
        sp.TryGetValue(sid.ToString(), out var p)) return p;
    return 0m;
}

// =============================================================== পাবলিক
app.MapGet("/api/bootstrap", (HttpContext ctx) =>
{
    var s = Db.GetSettings();
    var me = Who(ctx);
    var d = Db.Today();
    return Results.Json(new
    {
        office_name = s["office_name"],
        money_module = s["money_module"] == "1",
        today = d,
        now = Db.NowTime(),
        status = DayStatus(d, me?.floor),
        status_options = DAY_STATUS,
        allow_register = !s.TryGetValue("allow_register", out var ar) || ar == "1",
        floors = Floors(),
        user = me is null ? null : new { me.id, me.name, me.role, me.pin, me.floor },
    });
});

/// <summary>PIN যাচাই — ১–৬ সংখ্যা, আর কারো সাথে মিলতে পারবে না।</summary>
IResult? BadPin(string pin, int? exceptUserId = null)
{
    if (!System.Text.RegularExpressions.Regex.IsMatch(pin, @"^\d{1,6}$"))
        return Fail(400, "PIN হবে ১ থেকে ৬ সংখ্যার (শুধু নম্বর)");
    using var c = Db.Open();
    var taken = c.ExecuteScalar<int>(
        "SELECT COUNT(*) FROM dbo.users WHERE pin = @p AND (@i IS NULL OR id <> @i)",
        new { p = pin, i = exceptUserId });
    return taken > 0 ? Fail(400, "এই PIN আরেকজনের — অন্য একটা দিন") : null;
}

app.MapPost("/api/register", (HttpContext ctx, RegisterReq b) =>
{
    var s = Db.GetSettings();
    if (s.TryGetValue("allow_register", out var ar) && ar != "1")
        return Fail(403, "নতুন রেজিস্ট্রেশন এখন বন্ধ — অ্যাডমিনকে বলুন");

    var name = (b.name ?? "").Trim();
    var pin = (b.pin ?? "").Trim();
    var pass = b.password ?? "";

    if (name.Length < 2) return Fail(400, "নাম কমপক্ষে ২ অক্ষর হতে হবে");
    if (pass.Length < 4) return Fail(400, "পাসওয়ার্ড কমপক্ষে ৪ অক্ষর হতে হবে");
    var pinErr = BadPin(pin); if (pinErr is not null) return pinErr;
    if (b.floor is not int fl || !Floors().Contains(fl))
        return Fail(400, "আপনি কোন তলায় বসেন সেটা বেছে নিন");

    using var c = Db.Open();
    // এক নামে দুজন থাকতে পারে (অফিসে দুই "রাহাত" থাকা স্বাভাবিক) — PIN-ই আলাদা রাখতে হয়
    var id = c.ExecuteScalar<int>(
        @"INSERT INTO dbo.users(name, pin, floor, password_hash, role, created_at)
          VALUES(@n, @pin, @f, @p, 'user', @t); SELECT CAST(SCOPE_IDENTITY() AS INT);",
        new { n = name, pin, f = fl, p = BCrypt.Net.BCrypt.HashPassword(pass), t = Db.Stamp() });
    StartSession(ctx, id);
    return Results.Json(new { ok = true });
});

app.MapPost("/api/login", (HttpContext ctx, LoginReq b) =>
{
    using var c = Db.Open();
    // PIN দিয়ে, অথবা নাম দিয়েও (অ্যাডমিন "admin" দিয়ে ঢোকেন)।
    // এক নামে দুজন থাকতে পারে, তাই PIN-এর মিলটাই আগে ধরা হয় — PIN কখনো দুজনের এক নয়।
    var who = (b.pin ?? "").Trim();
    var u = c.QueryFirstOrDefault(
        @"SELECT TOP 1 * FROM dbo.users WHERE pin = @p OR name = @p
           ORDER BY CASE WHEN pin = @p THEN 0 ELSE 1 END, id", new { p = who });
    if (u is null || !BCrypt.Net.BCrypt.Verify(b.password ?? "", (string)u.password_hash))
        return Fail(400, "PIN বা পাসওয়ার্ড ভুল");
    if (!(bool)u.active) return Fail(403, "আপনার অ্যাকাউন্ট বন্ধ আছে");
    StartSession(ctx, (int)u.id);
    return Results.Json(new { ok = true });
});

app.MapPost("/api/logout", (HttpContext ctx) =>
{
    var token = ctx.Request.Cookies[COOKIE];
    if (!string.IsNullOrEmpty(token))
    {
        using var c = Db.Open();
        c.Execute("DELETE FROM dbo.sessions WHERE token = @t", new { t = token });
    }
    ctx.Response.Cookies.Delete(COOKIE);
    return Results.Json(new { ok = true });
});

app.MapPost("/api/change-password", (HttpContext ctx, PwdReq b) =>
{
    var (me, err) = Auth(ctx); if (err is not null) return err;
    if ((b.new_password ?? "").Length < 4) return Fail(400, "নতুন পাসওয়ার্ড কমপক্ষে ৪ অক্ষর");
    using var c = Db.Open();
    var u = c.QueryFirst("SELECT * FROM dbo.users WHERE id = @i", new { i = me!.id });
    if (!BCrypt.Net.BCrypt.Verify(b.old_password ?? "", (string)u.password_hash))
        return Fail(400, "পুরোনো পাসওয়ার্ড ভুল");
    c.Execute("UPDATE dbo.users SET password_hash = @p WHERE id = @i",
        new { p = BCrypt.Net.BCrypt.HashPassword(b.new_password!), i = me.id });
    return Results.Json(new { ok = true });
});

// =============================================================== অবস্থা
app.MapGet("/api/status", (HttpContext ctx, string? date, string? floor) =>
{
    var (me, err) = Auth(ctx); if (err is not null) return err;
    var d = IsDate(date) ? date! : Db.Today();
    var f = ScopeFloor(me!, floor);
    return Results.Json(new { date = d, floor = f, now = Db.NowTime(), status = DayStatus(d, f) });
});

app.MapPut("/api/status", (HttpContext ctx, StatusReq b) =>
{
    var (me, err) = Auth(ctx, "staff"); if (err is not null) return err;
    var date = IsDate(b.date) ? b.date! : Db.Today();
    var status = b.status ?? "";
    if (!DAY_STATUS.ContainsKey(status)) return Fail(400, "ভুল অবস্থা");
    // স্টাফ নিজের তলার জন্যই জানান; সুপার অ্যাডমিনকে তলা বেছে দিতে হয়
    var floor = me!.role == "super_admin" ? b.floor : me.floor;
    if (floor is null) return Fail(400, "কোন তলার জন্য জানাবেন সেটা আগে বেছে নিন");
    var msg = (b.message ?? "").Trim();
    if (msg.Length > 200) msg = msg[..200];

    using var c = Db.Open();
    c.Execute(
        @"UPDATE dbo.day_status
             SET status = @s, message = @m, updated_by = @u, updated_at = @t, version = version + 1
           WHERE day = @d AND floor = @f;
          IF @@ROWCOUNT = 0
          INSERT INTO dbo.day_status(day, floor, status, message, updated_by, updated_at, version)
          VALUES(@d, @f, @s, @m, @u, @t, 1);",
        new { d = date, f = floor, s = status, m = msg, u = me.id, t = Db.Stamp() });
    return Results.Json(new { ok = true, status = DayStatus(date, floor) });
});

// =============================================================== আইটেম
app.MapGet("/api/items", (HttpContext ctx, string? all) =>
{
    var (me, err) = Auth(ctx); if (err is not null) return err;
    var wantsAll = me!.role != "user" && all == "1";
    return Results.Json(LoadItems(onlyActive: !wantsAll));
});

// =============================================================== দোকান
app.MapGet("/api/shops", (HttpContext ctx, string? all) =>
{
    var (me, err) = Auth(ctx); if (err is not null) return err;
    var wantsAll = me!.role != "user" && all == "1";
    return Results.Json(LoadShops(onlyActive: !wantsAll));
});

app.MapPost("/api/shops", (HttpContext ctx, ShopReq b) =>
{
    var (_, err) = Auth(ctx, "staff"); if (err is not null) return err;
    if (string.IsNullOrWhiteSpace(b.name)) return Fail(400, "দোকানের নাম দিন");
    using var c = Db.Open();
    var id = c.ExecuteScalar<int>(
        "INSERT INTO dbo.shops(name, sort_order) VALUES(@n, @s); SELECT CAST(SCOPE_IDENTITY() AS INT);",
        new { n = b.name.Trim(), s = b.sort_order ?? 100 });
    return Results.Json(new { ok = true, id });
});

app.MapPut("/api/shops/{id:int}", (HttpContext ctx, int id, ShopReq b) =>
{
    var (_, err) = Auth(ctx, "staff"); if (err is not null) return err;
    using var c = Db.Open();
    var cur = c.QueryFirstOrDefault("SELECT * FROM dbo.shops WHERE id = @i", new { i = id });
    if (cur is null) return Fail(404, "দোকান নেই");
    c.Execute("UPDATE dbo.shops SET name = @n, active = @a, sort_order = @s WHERE id = @i",
        new
        {
            n = (b.name ?? (string)cur.name).Trim(),
            a = b.active.HasValue ? b.active.Value != 0 : (bool)cur.active,
            s = b.sort_order ?? (int)cur.sort_order,
            i = id,
        });
    return Results.Json(new { ok = true });
});

app.MapDelete("/api/shops/{id:int}", (HttpContext ctx, int id) =>
{
    var (_, err) = Auth(ctx, "staff"); if (err is not null) return err;
    using var c = Db.Open();
    c.Execute("UPDATE dbo.shops SET active = 0 WHERE id = @i", new { i = id });
    return Results.Json(new { ok = true });
});

/// <summary>
/// এক দোকানের সব দাম একসাথে সেভ।
/// দাম বসানো = এই দোকানে জিনিসটা পাওয়া যায়; ঘর খালি = এই দোকানে নেই।
/// </summary>
app.MapPut("/api/shops/{id:int}/prices", (HttpContext ctx, int id, ShopPricesReq b) =>
{
    var (_, err) = Auth(ctx, "staff"); if (err is not null) return err;
    using var c = Db.Open();
    if (c.ExecuteScalar<int>("SELECT COUNT(*) FROM dbo.shops WHERE id = @i", new { i = id }) == 0)
        return Fail(404, "দোকান নেই");

    foreach (var p in b.prices ?? new List<ShopPriceDto>())
    {
        if (p.item_id is not int itemId) continue;
        var price = p.price is decimal v && v > 0 ? M(v) : (decimal?)null;

        // ঘর খালি → এই দোকানে জিনিসটা নেই, তাই সারিটাই থাকবে না
        if (price is null)
        {
            c.Execute("DELETE FROM dbo.item_prices WHERE item_id = @i AND shop_id = @s",
                new { i = itemId, s = id });
            continue;
        }
        c.Execute(
            @"UPDATE dbo.item_prices SET price = @p, available = 1 WHERE item_id = @i AND shop_id = @s;
              IF @@ROWCOUNT = 0
              INSERT INTO dbo.item_prices(item_id, shop_id, price, available) VALUES(@i, @s, @p, 1);",
            new { i = itemId, s = id, p = price.Value });
    }
    return Results.Json(new { ok = true });
});

/// <summary>
/// আইটেম পাতা থেকে দোকান ধরে দাম সেভ।
/// দাম বসানো = ওই দোকানে পাওয়া যায়; ঘর খালি বা ০ = ওই দোকানে নেই।
/// </summary>
void SaveItemShopPrices(int itemId, List<ItemShopPriceDto>? rows)
{
    if (rows is null) return;
    using var c = Db.Open();
    foreach (var r in rows)
    {
        if (r.shop_id is not int sid) continue;
        var price = r.price is decimal v && v > 0 ? M(v) : (decimal?)null;
        if (price is null)
        {
            c.Execute("DELETE FROM dbo.item_prices WHERE item_id = @i AND shop_id = @s",
                new { i = itemId, s = sid });
            continue;
        }
        c.Execute(
            @"UPDATE dbo.item_prices SET price = @p, available = 1 WHERE item_id = @i AND shop_id = @s;
              IF @@ROWCOUNT = 0
              INSERT INTO dbo.item_prices(item_id, shop_id, price, available) VALUES(@i, @s, @p, 1);",
            new { i = itemId, s = sid, p = price.Value });
    }
}

void SaveOptions(int itemId, List<OptionDto>? options)
{
    if (options is null) return;
    using var c = Db.Open();
    c.Execute("DELETE FROM dbo.item_options WHERE item_id = @i", new { i = itemId });
    var clean = options.Where(o => !string.IsNullOrWhiteSpace(o.name)).ToList();
    // ঠিক একটাই ডিফল্ট থাকবে; কেউ না বললে প্রথমটাই
    var defIdx = clean.FindIndex(o => (o.is_default ?? 0) != 0);
    if (defIdx < 0 && clean.Count > 0) defIdx = 0;
    for (int i = 0; i < clean.Count; i++)
        c.Execute(
            @"INSERT INTO dbo.item_options(item_id, name, price_delta, sort_order, is_default)
              VALUES(@i, @n, @d, @s, @def)",
            new { i = itemId, n = clean[i].name!.Trim(), d = M(clean[i].price_delta ?? 0), s = (i + 1) * 10, def = i == defIdx });
}

// আইটেম স্টাফও যোগ করতে পারেন — দোকানভেদে নতুন জিনিস তো তাঁরাই জানেন
app.MapPost("/api/items", (HttpContext ctx, ItemReq b) =>
{
    var (_, err) = Auth(ctx, "staff"); if (err is not null) return err;
    if (string.IsNullOrWhiteSpace(b.name)) return Fail(400, "আইটেমের নাম দিন");
    using var c = Db.Open();
    var id = c.ExecuteScalar<int>(
        @"INSERT INTO dbo.items(name, price, category, sort_order)
          VALUES(@n, @p, @c, @s); SELECT CAST(SCOPE_IDENTITY() AS INT);",
        new { n = b.name.Trim(), p = M(b.price ?? 0), c = (b.category ?? "নাস্তা").Trim(), s = b.sort_order ?? 100 });
    SaveOptions(id, b.options);
    SaveItemShopPrices(id, b.shop_prices);
    return Results.Json(new { ok = true, id });
});

app.MapPut("/api/items/{id:int}", (HttpContext ctx, int id, ItemReq b) =>
{
    var (_, err) = Auth(ctx, "staff"); if (err is not null) return err;
    using var c = Db.Open();
    var cur = c.QueryFirstOrDefault("SELECT * FROM dbo.items WHERE id = @i", new { i = id });
    if (cur is null) return Fail(404, "আইটেম নেই");
    c.Execute(
        @"UPDATE dbo.items SET name=@n, price=@p, category=@c, sort_order=@s, active=@a, available=@v WHERE id=@i",
        new
        {
            n = (b.name ?? (string)cur.name).Trim(),
            p = M(b.price ?? (decimal)cur.price),
            c = (b.category ?? (string)cur.category).Trim(),
            s = b.sort_order ?? (int)cur.sort_order,
            a = b.active.HasValue ? b.active.Value != 0 : (bool)cur.active,
            v = b.available.HasValue ? b.available.Value != 0 : (bool)cur.available,
            i = id,
        });
    SaveOptions(id, b.options);
    SaveItemShopPrices(id, b.shop_prices);
    return Results.Json(new { ok = true });
});

app.MapPatch("/api/items/{id:int}/available", (HttpContext ctx, int id, AvailReq b) =>
{
    var (_, err) = Auth(ctx, "staff"); if (err is not null) return err;
    using var c = Db.Open();
    c.Execute("UPDATE dbo.items SET available = @v WHERE id = @i", new { v = (b.available ?? 0) != 0, i = id });
    return Results.Json(new { ok = true });
});

app.MapDelete("/api/items/{id:int}", (HttpContext ctx, int id) =>
{
    var (_, err) = Auth(ctx, "staff"); if (err is not null) return err;
    using var c = Db.Open();
    c.Execute("UPDATE dbo.items SET active = 0 WHERE id = @i", new { i = id });
    return Results.Json(new { ok = true });
});

// =============================================================== অর্ডার
Dictionary<string, object?>? Hydrate(dynamic? order)
{
    if (order is null) return null;
    var d = D(order);
    using var c = Db.Open();
    d["lines"] = DL(c.Query("SELECT * FROM dbo.order_lines WHERE order_id = @o ORDER BY id", new { o = d["id"] }));
    d["accepted"] = Accepted(d);
    return d;
}

/// <summary>স্টাফ অর্ডারটা গ্রহণ করেছেন কি না। কেনা/দেওয়া হয়ে গেলে সেটা তো গ্রহণই।</summary>
static bool Accepted(Dictionary<string, object?> o)
{
    if (o.TryGetValue("accepted_at", out var a) && a is string s && s.Length > 0) return true;
    return o.TryGetValue("status", out var st) && st is "purchased" or "delivered";
}

/// <summary>
/// লাইনগুলো থেকে অর্ডারের মোট আবার হিসাব করে।
/// জিনিসটা পাওয়া না গেলে তার দাম বাদ — বদলে যা আনা হয়েছে সেটার দাম ধরা হয়।
/// </summary>
void RecalcTotal(int orderId)
{
    using var c = Db.Open();
    var total = M(c.ExecuteScalar<decimal?>(
        @"SELECT ISNULL(SUM(CASE WHEN missing = 1 THEN sub_subtotal ELSE subtotal END), 0)
            FROM dbo.order_lines WHERE order_id = @o", new { o = orderId }) ?? 0m);
    c.Execute("UPDATE dbo.orders SET total = @t, updated_at = @u WHERE id = @i",
        new { t = total, u = Db.Stamp(), i = orderId });
    SyncCharge(orderId);
}

/// <summary>অর্ডার "দেওয়া হয়েছে" হলে হিসাবে খরচ বসায়, না হলে সরায়।</summary>
void SyncCharge(int orderId)
{
    using var c = Db.Open();
    c.Execute("DELETE FROM dbo.ledger WHERE ref_order_id = @o AND type = 'charge'", new { o = orderId });
    var o = c.QueryFirstOrDefault("SELECT * FROM dbo.orders WHERE id = @i", new { i = orderId });
    if (o is null) return;
    if ((string)o.status == "delivered" && (decimal)o.total > 0)
        c.Execute(
            @"INSERT INTO dbo.ledger(user_id, type, amount, note, ref_order_id, created_at)
              VALUES(@u, 'charge', @a, @n, @o, @t)",
            new { u = (int)o.user_id, a = (decimal)o.total, n = $"{o.order_date} তারিখের নাস্তা", o = orderId, t = Db.Stamp() });
}

app.MapGet("/api/orders/my", (HttpContext ctx, string? date, int? user_id) =>
{
    var (me, err) = Auth(ctx); if (err is not null) return err;
    var d = IsDate(date) ? date! : Db.Today();
    using var c = Db.Open();

    // স্টাফ চাইলে কারো হয়ে অর্ডার করতে পারেন — তখন ওই ইউজারের অর্ডারই দেখানো হয়
    var actor = me!;
    var target = actor;
    if (user_id is int uid && uid != actor.id)
    {
        if (actor.role == "user") return Fail(403, "এটা আপনার অর্ডার না");
        var tu = c.QueryFirstOrDefault("SELECT id, name, role, pin, floor, default_shop_id FROM dbo.users WHERE id = @i",
            new { i = uid });
        if (tu is null) return Fail(404, "ইউজার নেই");
        if (actor.role == "staff" && actor.floor is not null && (int?)tu.floor != actor.floor)
            return Fail(403, "ইনি আপনার তলার নন");
        target = new Me((int)tu.id, (string)tu.name, (string)tu.role, (string?)tu.pin ?? "", (int?)tu.floor);
    }

    var row = c.QueryFirstOrDefault("SELECT * FROM dbo.orders WHERE user_id = @u AND order_date = @d",
        new { u = target.id, d });
    // বাতিল হওয়া অর্ডার আজকের অর্ডার নয় — পাতা খালি থাকে, নতুন করে দেওয়া যায়।
    // তবে কেউ যেন অবাক না হন, তাই বাতিলের খবরটা আলাদা করে পাঠানো হয়।
    var cancelled = row is not null && (string)row.status == "cancelled";
    var o = cancelled ? null : row;
    var prof = c.QueryFirstOrDefault("SELECT default_shop_id, usual_json FROM dbo.users WHERE id = @i",
        new { i = target.id });

    // কে গ্রহণ করেছেন — ইউজারকে নামটা দেখালে ভরসা লাগে
    var acceptedBy = o?.accepted_by is int ab
        ? c.ExecuteScalar<string?>("SELECT name FROM dbo.users WHERE id = @i", new { i = ab })
        : null;

    return Results.Json(new
    {
        date = d,
        now = Db.NowTime(),
        status = DayStatus(d, target.floor),
        locked = OrderLocked(o, actor, d),
        lock_reason = LockReason(d, target.floor, o),
        late_note = LateNote(d, target.floor),
        order = Hydrate(o),
        cancelled_order = cancelled
            ? new { id = (int)row!.id, total = (decimal)row.total, cancelled_at = (string?)row.cancelled_at }
            : null,
        accepted_by_name = acceptedBy,
        for_user = target.id == actor.id ? null : new { target.id, target.name, target.floor },
        default_shop_id = (int?)prof?.default_shop_id,
        // favourites = পুরো তালিকা; usual = প্রথমটা, শুধু পুরোনো ক্যাশে থাকা
        // app.js যেন ভেঙে না পড়ে সেজন্য রাখা হলো
        favourites = ReadFavs((string?)prof?.usual_json),
        usual = ReadFavs((string?)prof?.usual_json).FirstOrDefault(),
    });
});

/// <summary>
/// প্রিয় নাস্তা — একজনের একটার বেশি থাকতে পারে ("চা-সিঙ্গারা", "শুধু চা"...)।
///
/// `users.usual_json`-এ এখন তালিকা থাকে: <c>{ v: 2, list: [ { id, name, shop_id, lines } ] }</c>।
/// পুরোনো এক-অর্ডারের শেপ (<c>{ shop_id, lines }</c>) পড়ার সময়ই তালিকায় বদলে
/// নেওয়া হয়, তাই ডেটাবেজে আলাদা মাইগ্রেশন লাগেনি আর কারো সেভ করা রোজকার
/// অর্ডারও হারায়নি। নষ্ট JSON হলে চুপচাপ খালি তালিকা।
/// </summary>
static List<FavDto> ReadFavs(string? json)
{
    if (string.IsNullOrWhiteSpace(json)) return new();
    try
    {
        using var doc = JsonDocument.Parse(json);
        if (doc.RootElement.TryGetProperty("list", out var l) && l.ValueKind == JsonValueKind.Array)
        {
            var list = JsonSerializer.Deserialize<List<FavDto>>(l.GetRawText()) ?? new();
            return list.Where(f => f.lines is { Count: > 0 }).ToList();
        }
        // পুরোনো শেপ — একটাই রোজকার অর্ডার
        var old = JsonSerializer.Deserialize<FavDto>(json);
        if (old?.lines is { Count: > 0 })
            return new() { old with { id = 1, name = "রোজকার অর্ডার" } };
    }
    catch { /* নষ্ট JSON — খালি ধরা হয় */ }
    return new();
}

static string WriteFavs(List<FavDto> list) => JsonSerializer.Serialize(new { v = 2, list });

/// <summary>এক জায়গায় রাখা হলো, কারণ সীমাটা সার্ভারেই ধরা দরকার।</summary>
const int MaxFavs = 8;

/// <summary>
/// প্রিয় নাস্তা যোগ বা বদল। id দিলে ওটাই বদলায় (নাম পাল্টানো সহ), না দিলে
/// নতুন একটা যোগ হয়। স্টাফ চাইলে নিজের তলার কারো জন্যও রাখতে পারেন।
/// </summary>
app.MapPost("/api/me/favourites", (HttpContext ctx, FavReq b) =>
{
    var (me, err) = Auth(ctx); if (err is not null) return err;
    var uid = UsualTarget(me!, b.user_id, out var uErr); if (uErr is not null) return uErr;
    var lines = b.lines ?? new List<LineDto>();
    if (lines.Count == 0) return Fail(400, "অন্তত একটা জিনিস বেছে নিন");

    using var c = Db.Open();
    var list = ReadFavs(c.ExecuteScalar<string?>(
        "SELECT usual_json FROM dbo.users WHERE id = @i", new { i = uid }));

    var name = (b.name ?? "").Trim();
    if (name.Length > 40) name = name[..40];

    var at = b.id is int fid ? list.FindIndex(f => f.id == fid) : -1;
    if (at >= 0)
    {
        list[at] = list[at] with
        {
            name = name.Length > 0 ? name : list[at].name,
            shop_id = b.shop_id,
            lines = lines,
        };
    }
    else
    {
        if (list.Count >= MaxFavs)
            return Fail(400, "সর্বোচ্চ ৮টা প্রিয় নাস্তা রাখা যায় — একটা সরিয়ে তারপর যোগ করুন");
        var nextId = list.Count == 0 ? 1 : list.Max(f => f.id) + 1;
        if (name.Length == 0) name = $"প্রিয় {list.Count + 1}";
        list.Add(new FavDto(nextId, name, b.shop_id, lines));
    }

    c.Execute("UPDATE dbo.users SET usual_json = @j WHERE id = @i", new { j = WriteFavs(list), i = uid });
    return Results.Json(new { ok = true, favourites = list });
});

app.MapDelete("/api/me/favourites/{id:int}", (HttpContext ctx, int id, int? user_id) =>
{
    var (me, err) = Auth(ctx); if (err is not null) return err;
    var uid = UsualTarget(me!, user_id, out var uErr); if (uErr is not null) return uErr;
    using var c = Db.Open();
    var list = ReadFavs(c.ExecuteScalar<string?>(
        "SELECT usual_json FROM dbo.users WHERE id = @i", new { i = uid }));
    list.RemoveAll(f => f.id == id);
    c.Execute("UPDATE dbo.users SET usual_json = @j WHERE id = @i",
        new { j = list.Count == 0 ? null : WriteFavs(list), i = uid });
    return Results.Json(new { ok = true, favourites = list });
});

/// <summary>
/// পুরোনো এন্ডপয়েন্ট — বাদ দেওয়া হয়নি ইচ্ছে করেই। কারো ফোনে পুরোনো app.js
/// ক্যাশে থেকে গেলে এটা যেন পুরো তালিকা মুছে না ফেলে, তাই এখন এটা শুধু
/// প্রথম প্রিয়টা বদলায় (বা একটা নতুন যোগ করে)।
/// </summary>
app.MapPut("/api/me/usual", (HttpContext ctx, UsualReq b) =>
{
    var (me, err) = Auth(ctx); if (err is not null) return err;
    var uid = UsualTarget(me!, b.user_id, out var uErr); if (uErr is not null) return uErr;
    var lines = b.lines ?? new List<LineDto>();
    if (lines.Count == 0) return Fail(400, "অন্তত একটা জিনিস বেছে নিন");
    using var c = Db.Open();
    var list = ReadFavs(c.ExecuteScalar<string?>(
        "SELECT usual_json FROM dbo.users WHERE id = @i", new { i = uid }));
    if (list.Count > 0) list[0] = list[0] with { shop_id = b.shop_id, lines = lines };
    else list.Add(new FavDto(1, "রোজকার অর্ডার", b.shop_id, lines));
    c.Execute("UPDATE dbo.users SET usual_json = @j WHERE id = @i", new { j = WriteFavs(list), i = uid });
    return Results.Json(new { ok = true, favourites = list });
});

app.MapDelete("/api/me/usual", (HttpContext ctx, int? user_id) =>
{
    var (me, err) = Auth(ctx); if (err is not null) return err;
    var uid = UsualTarget(me!, user_id, out var uErr); if (uErr is not null) return uErr;
    using var c = Db.Open();
    c.Execute("UPDATE dbo.users SET usual_json = NULL WHERE id = @i", new { i = uid });
    return Results.Json(new { ok = true });
});

int UsualTarget(Me me, int? userId, out IResult? error)
{
    error = null;
    if (userId is not int uid || uid == me.id) return me.id;
    if (me.role == "user") { error = Fail(403, "এটা আপনার নয়"); return me.id; }
    var fErr = NotMyFloor(me, uid);
    if (fErr is not null) { error = fErr; return me.id; }
    return uid;
}

/// <summary>
/// অর্ডারের ইতিহাস — কোনো সীমা নেই (আগে শুধু শেষ ৬০টা দেখাত)।
/// from/to দিলে ওই সময়টুকু (মাস ধরে বা "অমুক তারিখ থেকে আজ পর্যন্ত")।
/// বাতিল অর্ডারও আসে, "বাতিল" লেখা থাকে — কিছুই হারিয়ে যায় না।
/// ইউজার নিজেরটা দেখেন; স্টাফ user_id দিয়ে নিজের তলার কারো।
/// </summary>
app.MapGet("/api/orders/history", (HttpContext ctx, int? user_id, string? from, string? to) =>
{
    var (me, err) = Auth(ctx); if (err is not null) return err;
    var uid = me!.id;
    if (user_id is int u && u != me.id)
    {
        if (me.role == "user") return Fail(403, "এটা আপনার অর্ডার না");
        var fErr = NotMyFloor(me, u); if (fErr is not null) return fErr;
        uid = u;
    }
    var f = IsDate(from) ? from : null;
    var t = IsDate(to) ? to : null;
    using var c = Db.Open();
    var orders = DL(c.Query(
        @"SELECT id, order_date, status, total, shop_name, note, accepted_at, cancelled_at, created_at
            FROM dbo.orders
           WHERE user_id = @u AND (@f IS NULL OR order_date >= @f) AND (@t IS NULL OR order_date <= @t)
           ORDER BY order_date DESC", new { u = uid, f, t }));
    HydrateMany(c, orders);

    var live = orders.Where(o => (string)o["status"]! != "cancelled").ToList();
    return Results.Json(new
    {
        from = f,
        to = t,
        orders,
        summary = new
        {
            days = live.Count,
            amount = M(live.Sum(o => (decimal)o["total"]!)),
            cancelled = orders.Count - live.Count,
        },
    });
});

/// <summary>অনেকগুলো অর্ডারের লাইন একবারে আনা — একটা একটা করে আনলে দূরের ডেটাবেজে অনেক সময় লাগে।</summary>
void HydrateMany(IDbConnection c, List<Dictionary<string, object?>> orders)
{
    var byId = orders.ToDictionary(o => (int)o["id"]!);
    foreach (var o in orders)
    {
        o["lines"] = new List<Dictionary<string, object?>>();
        o["accepted"] = Accepted(o);
    }
    // SQL Server-এ একটা কোয়েরিতে প্যারামিটারের সীমা আছে, তাই ভাগে ভাগে
    foreach (var chunk in byId.Keys.Chunk(1000))
        foreach (var l in DL(c.Query("SELECT * FROM dbo.order_lines WHERE order_id IN @ids ORDER BY id",
                     new { ids = chunk })))
            ((List<Dictionary<string, object?>>)byId[(int)l["order_id"]!]["lines"]!).Add(l);
}

app.MapPost("/api/orders", (HttpContext ctx, OrderReq b) =>
{
    var (me, err) = Auth(ctx); if (err is not null) return err;
    var date = IsDate(b.date) ? b.date! : Db.Today();
    var targetUserId = me!.role == "user" ? me.id : (b.user_id ?? me.id);
    var note = (b.note ?? "").Trim();

    using var c = Db.Open();

    // স্টাফ শুধু নিজের তলার কারো হয়ে অর্ডার করতে পারেন
    if (targetUserId != me.id && me.role == "staff" && me.floor is not null)
    {
        var tf = c.ExecuteScalar<int?>("SELECT floor FROM dbo.users WHERE id = @i", new { i = targetUserId });
        if (tf != me.floor) return Fail(403, "ইনি আপনার তলার নন");
    }
    var existing = c.QueryFirstOrDefault("SELECT * FROM dbo.orders WHERE user_id = @u AND order_date = @d",
        new { u = targetUserId, d = date });
    if (OrderLocked(existing, me, date)) return Fail(400, LockReason(date, me.floor, existing));

    // কোন দোকান থেকে — দাম এখান থেকেই ঠিক হয়
    int? shopId = b.shop_id is int s && s > 0 ? s : null;
    var shopName = "";
    if (shopId is not null)
    {
        var shop = c.QueryFirstOrDefault("SELECT * FROM dbo.shops WHERE id = @i", new { i = shopId });
        if (shop is null) shopId = null; else shopName = (string)shop.name;
    }

    var items = LoadItems(onlyActive: false).ToDictionary(i => (int)i["id"]!);
    var prepared = new List<Dictionary<string, object?>>();
    // চাওয়া হয়েছিল কিন্তু বসানো গেল না — চুপচাপ বাদ না দিয়ে ইউজারকে জানাতে হবে
    var dropped = new List<string>();
    var requested = 0;

    foreach (var l in b.lines ?? new List<LineDto>())
    {
        var qty = Math.Clamp(l.qty ?? 0, 0, 99);
        if (qty == 0) continue;
        requested++;
        if (!items.TryGetValue(l.item_id ?? 0, out var item)) { dropped.Add("একটা পুরোনো আইটেম"); continue; }
        if (!SoldAt(item, shopId)) { dropped.Add((string)item["name"]!); continue; }   // এই দোকানে জিনিসটা নেই

        var opts = (List<Dictionary<string, object?>>)item["options"]!;
        var opt = opts.FirstOrDefault(o => (int)o["id"]! == (l.option_id ?? 0));
        // কেউ রকম না বাছলে ডিফল্টটাই ধরা হয় (যেমন পরোটা → তেল দিয়ে)
        if (opt is null && opts.Count > 0)
            opt = opts.FirstOrDefault(o => (bool)o["is_default"]!) ?? opts[0];
        var unit = M(PriceOf(item, shopId) + (opt is null ? 0m : (decimal)opt["price_delta"]!));

        var fbType = l.fallback_type is "skip" or "anything" or "item" ? l.fallback_type! : "skip";
        int? fbId = null; var fbName = "";
        if (fbType == "item")
        {
            if (items.TryGetValue(l.fallback_item_id ?? 0, out var fb))
            {
                fbId = (int)fb["id"]!;
                fbName = (string)fb["name"]!;
            }
            else fbType = "anything";
        }
        var fbNote = (l.fallback_note ?? "").Trim();
        if (fbNote.Length > 200) fbNote = fbNote[..200];

        prepared.Add(new Dictionary<string, object?>
        {
            ["item_id"] = item["id"],
            ["item_name"] = item["name"],
            ["option_id"] = opt?["id"],
            ["option_name"] = opt is null ? "" : opt["name"],
            ["unit_price"] = unit,
            ["qty"] = qty,
            ["subtotal"] = M(unit * qty),
            ["fallback_type"] = fbType,
            ["fallback_item_id"] = fbId,
            ["fallback_name"] = fbName,
            ["fallback_note"] = fbNote,
        });
    }

    // ---- কিছু বদলানোর আগেই যাচাই: অর্ডার কখনো চুপচাপ মুছে যাবে না ----
    // আগে সব লাইন বাদ পড়লে (যেমন বাছা দোকানে জিনিসগুলো নেই) অর্ডারটা টাকার হিসাবসহ
    // ডেটাবেজ থেকে মুছে যেত, অথচ পর্দায় দেখাত "✅ অর্ডার সেভ হয়েছে"।
    if (prepared.Count == 0)
    {
        if (requested > 0)
            return Fail(400, shopId is null
                ? "কোন দোকান থেকে আনবেন সেটা আগে বেছে নিন"
                : $"{shopName}-এ এগুলো পাওয়া যায় না: {string.Join(", ", dropped.Distinct())} — অন্য দোকান বেছে নিন");

        // একদম খালি পাঠানো = বাতিল। শুধু স্টাফ পারেন, আর মোছা হয় না — "বাতিল" অবস্থা হয়
        var active = existing is not null && (string)existing.status != "cancelled";
        if (!active) return Fail(400, "অন্তত একটা জিনিস বেছে নিন");
        if (me.role == "user") return Fail(400, LockReason(date, me.floor, existing));
        CancelOrder(c, (int)existing!.id, me.id);
        return Results.Json(new { ok = true, id = (int)existing.id, total = 0m, cancelled = true, dropped });
    }

    var total = M(prepared.Sum(p => (decimal)p["subtotal"]!));
    int orderId;
    if (existing is not null)
    {
        orderId = (int)existing.id;
        // অর্ডার বদলালে "গ্রহণ করা হয়েছে" মুছে যায় — স্টাফ যেন নতুন তালিকাটা দেখে আবার নেন।
        // বাতিল অর্ডারের দিনে আবার অর্ডার দিলে ওই সারিটাই নতুন করে চালু হয় (দিনে একটাই অর্ডার)।
        c.Execute(
            @"UPDATE dbo.orders
                 SET note=@n, total=@t, shop_id=@sid, shop_name=@sn, updated_at=@u,
                     accepted_at = NULL, accepted_by = NULL,
                     status = CASE WHEN status = 'cancelled' THEN 'pending' ELSE status END,
                     cancelled_at = NULL, cancelled_by = NULL
               WHERE id=@i",
            new { n = note, t = total, sid = shopId, sn = shopName, u = Db.Stamp(), i = orderId });
        c.Execute("DELETE FROM dbo.order_lines WHERE order_id = @o", new { o = orderId });
    }
    else
    {
        orderId = c.ExecuteScalar<int>(
            @"INSERT INTO dbo.orders(user_id, order_date, note, total, shop_id, shop_name, created_at, updated_at)
              VALUES(@u, @d, @n, @t, @sid, @sn, @c, @c); SELECT CAST(SCOPE_IDENTITY() AS INT);",
            new { u = targetUserId, d = date, n = note, t = total, sid = shopId, sn = shopName, c = Db.Stamp() });
    }

    foreach (var p in prepared)
        c.Execute(
            @"INSERT INTO dbo.order_lines
              (order_id, item_id, item_name, option_id, option_name, unit_price, qty, subtotal,
               fallback_type, fallback_item_id, fallback_name, fallback_note)
              VALUES(@order_id, @item_id, @item_name, @option_id, @option_name, @unit_price, @qty, @subtotal,
                     @fallback_type, @fallback_item_id, @fallback_name, @fallback_note)",
            new
            {
                order_id = orderId,
                item_id = p["item_id"],
                item_name = p["item_name"],
                option_id = p["option_id"],
                option_name = p["option_name"],
                unit_price = p["unit_price"],
                qty = p["qty"],
                subtotal = p["subtotal"],
                fallback_type = p["fallback_type"],
                fallback_item_id = p["fallback_item_id"],
                fallback_name = p["fallback_name"],
                fallback_note = p["fallback_note"],
            });

    SyncCharge(orderId);

    // পরেরবার যেন দোকানটা নিজে থেকেই বাছা থাকে — একটা ক্লিক কম
    if (shopId is not null)
        c.Execute("UPDATE dbo.users SET default_shop_id = @s WHERE id = @i",
            new { s = shopId, i = targetUserId });

    // কিছু লাইন বাদ পড়লে সেটাও ফেরত যায়, যাতে পর্দায় সত্যি কথাটা দেখানো যায়
    return Results.Json(new { ok = true, id = orderId, total, dropped = dropped.Distinct().ToList() });
});

/// <summary>
/// অর্ডার বাতিল — মোছা নয়। লাইনগুলো থেকে যায়, ইতিহাসে "বাতিল" হিসেবে দেখা যায়,
/// শুধু খরচটা হিসাব থেকে সরে যায় (SyncCharge শুধু "দেওয়া হয়েছে" অর্ডারেই খরচ বসায়)।
/// </summary>
void CancelOrder(IDbConnection c, int orderId, int byUserId)
{
    var t = Db.Stamp();
    c.Execute(
        @"UPDATE dbo.orders
             SET status = 'cancelled', cancelled_at = @t, cancelled_by = @b,
                 accepted_at = NULL, accepted_by = NULL, updated_at = @t
           WHERE id = @i",
        new { t, b = byUserId, i = orderId });
    SyncCharge(orderId);
}

app.MapGet("/api/orders", (HttpContext ctx, string? date, string? floor) =>
{
    var (me, err) = Auth(ctx, "staff"); if (err is not null) return err;
    var d = IsDate(date) ? date! : Db.Today();
    var f = ScopeFloor(me!, floor);
    using var c = Db.Open();
    var rows = c.Query(
        @"SELECT o.*, u.id AS user_id, u.name AS user_name, u.pin, u.floor AS user_floor FROM dbo.orders o
            JOIN dbo.users u ON u.id = o.user_id
           WHERE o.order_date = @d AND (@f IS NULL OR u.floor = @f)
           ORDER BY u.floor, u.name", new { d, f });
    return Results.Json(new { date = d, floor = f, orders = rows.Select(r => Hydrate(r)).ToList() });
});

app.MapPatch("/api/orders/{id:int}/status", (HttpContext ctx, int id, OStatusReq b) =>
{
    var (me, err) = Auth(ctx, "staff"); if (err is not null) return err;
    var st = b.status ?? "";
    if (st is not ("pending" or "purchased" or "delivered" or "cancelled")) return Fail(400, "ভুল স্ট্যাটাস");
    using var c = Db.Open();
    var owner = c.ExecuteScalar<int?>("SELECT user_id FROM dbo.orders WHERE id = @i", new { i = id });
    if (owner is null) return Fail(404, "অর্ডার নেই");
    var fErr = NotMyFloor(me!, owner.Value); if (fErr is not null) return fErr;
    c.Execute("UPDATE dbo.orders SET status=@s, updated_at=@u WHERE id=@i",
        new { s = st, u = Db.Stamp(), i = id });
    SyncCharge(id);
    return Results.Json(new { ok = true });
});

/// <summary>
/// জিনিসটা দোকানে পাওয়া যায়নি — স্টাফ ওই ব্যক্তির নামেই বদলি জিনিসটা বসিয়ে দেন।
/// ইউজার তখন দেখেন "এটা পাওয়া যায়নি, আপনি যেকোনো কিছু বলেছিলেন তাই এটা আনা হয়েছে"।
/// </summary>
app.MapPatch("/api/order-lines/{id:int}/substitute", (HttpContext ctx, int id, SubReq b) =>
{
    var (me, err) = Auth(ctx, "staff"); if (err is not null) return err;
    using var c = Db.Open();
    var ln = c.QueryFirstOrDefault(
        @"SELECT ol.id, ol.order_id, ol.qty, o.user_id, o.shop_id FROM dbo.order_lines ol
            JOIN dbo.orders o ON o.id = ol.order_id WHERE ol.id = @i", new { i = id });
    if (ln is null) return Fail(404, "লাইনটা নেই");
    var fErr = NotMyFloor(me!, (int)ln.user_id); if (fErr is not null) return fErr;

    var missing = b.missing ?? true;
    if (!missing)
    {
        // "আসলে পাওয়া গেছে" — বদলিটা মুছে গিয়ে আগের দামই ফিরে আসে
        c.Execute(
            @"UPDATE dbo.order_lines
                 SET missing = 0, sub_item_id = NULL, sub_name = N'', sub_unit_price = 0,
                     sub_qty = 0, sub_subtotal = 0, sub_note = N''
               WHERE id = @i", new { i = id });
        RecalcTotal((int)ln.order_id);
        return Results.Json(new { ok = true, missing = false });
    }

    // বদলে কী আনা হলো — আইটেম বাছলে তার নাম/দাম নিজে থেকেই বসে
    int? subId = b.item_id is int si && si > 0 ? si : null;
    var subName = (b.name ?? "").Trim();
    var unit = M(b.unit_price ?? 0m);
    if (subId is not null)
    {
        // দাম বলা না থাকলে অর্ডারের ওই দোকানের দামই ধরা হয় — বাকি লাইনগুলোর মতোই
        var it = c.QueryFirstOrDefault(
            @"SELECT i.name,
                     ISNULL((SELECT ip.price FROM dbo.item_prices ip
                              WHERE ip.item_id = i.id AND ip.shop_id = @s), 0) AS price
                FROM dbo.items i WHERE i.id = @i",
            new { i = subId, s = (int?)ln.shop_id });
        if (it is null) return Fail(400, "আইটেমটা নেই");
        if (subName.Length == 0) subName = (string)it.name;
        if (b.unit_price is null) unit = M((decimal)it.price);
    }
    if (subName.Length > 100) subName = subName[..100];

    // কিছুই আনা হয়নি — শুধু "পাওয়া যায়নি" বলে রাখা, দাম ০
    var qty = Math.Clamp(b.qty ?? (int)ln.qty, 0, 99);
    if (subName.Length == 0) { qty = 0; unit = 0m; }
    if (unit < 0) return Fail(400, "দাম ঋণাত্মক হতে পারে না");

    var note = (b.note ?? "").Trim();
    if (note.Length > 200) note = note[..200];

    c.Execute(
        @"UPDATE dbo.order_lines
             SET missing = 1, sub_item_id = @si, sub_name = @sn, sub_unit_price = @up,
                 sub_qty = @q, sub_subtotal = @st, sub_note = @nt
           WHERE id = @i",
        new { si = subId, sn = subName, up = unit, q = qty, st = M(unit * qty), nt = note, i = id });

    RecalcTotal((int)ln.order_id);
    var total = c.ExecuteScalar<decimal>("SELECT total FROM dbo.orders WHERE id = @i", new { i = (int)ln.order_id });
    return Results.Json(new { ok = true, missing = true, order_total = total });
});

/// <summary>স্টাফ "অর্ডারটা নিলাম" বলে দেন — ইউজারের পাতায় সাথে সাথেই দেখায়।</summary>
app.MapPatch("/api/orders/{id:int}/accept", (HttpContext ctx, int id, AcceptReq b) =>
{
    var (me, err) = Auth(ctx, "staff"); if (err is not null) return err;
    using var c = Db.Open();
    var owner = c.ExecuteScalar<int?>("SELECT user_id FROM dbo.orders WHERE id = @i", new { i = id });
    if (owner is null) return Fail(404, "অর্ডার নেই");
    var fErr = NotMyFloor(me!, owner.Value); if (fErr is not null) return fErr;

    var on = b.accepted ?? true;
    // updated_at ছোঁয়া হয় না — নইলে গ্রহণ করার পরই অর্ডারটা আবার "নতুন" হয়ে ঘণ্টায় বাজবে
    c.Execute("UPDATE dbo.orders SET accepted_at = @a, accepted_by = @b WHERE id = @i",
        new { a = on ? Db.Stamp() : null, b = on ? me!.id : (int?)null, i = id });
    return Results.Json(new { ok = true, accepted = on });
});

app.MapPost("/api/orders/deliver-all", (HttpContext ctx, DeliverAllReq b) =>
{
    var (me, err) = Auth(ctx, "staff"); if (err is not null) return err;
    var date = IsDate(b.date) ? b.date! : Db.Today();
    var f = ScopeFloor(me!, b.floor?.ToString());
    using var c = Db.Open();
    var ids = c.Query<int>(
        @"SELECT o.id FROM dbo.orders o JOIN dbo.users u ON u.id = o.user_id
           WHERE o.order_date = @d AND o.status <> 'cancelled' AND (@f IS NULL OR u.floor = @f)",
        new { d = date, f }).ToList();
    foreach (var id in ids)
    {
        c.Execute("UPDATE dbo.orders SET status='delivered', updated_at=@u WHERE id=@i",
            new { u = Db.Stamp(), i = id });
        SyncCharge(id);
    }
    return Results.Json(new { ok = true, count = ids.Count });
});

app.MapDelete("/api/orders/{id:int}", (HttpContext ctx, int id) =>
{
    var (me, err) = Auth(ctx); if (err is not null) return err;
    using var c = Db.Open();
    var o = c.QueryFirstOrDefault("SELECT * FROM dbo.orders WHERE id = @i", new { i = id });
    if (o is null) return Fail(404, "অর্ডার নেই");
    if (me!.role == "user")
    {
        if ((int)o.user_id != me.id) return Fail(403, "এটা আপনার অর্ডার না");
        if (OrderLocked(o, me, (string)o.order_date))
            return Fail(400, LockReason((string)o.order_date, me.floor, o));
    }
    var fErr = NotMyFloor(me, (int)o.user_id); if (fErr is not null) return fErr;
    // মুছে ফেলা নয় — "বাতিল" করে রাখা, যাতে ইতিহাসে পুরোনো অর্ডারটা থেকে যায়
    if ((string)o.status != "cancelled") CancelOrder(c, id, me.id);
    return Results.Json(new { ok = true, cancelled = true });
});

// =============================================== বাজারের লিস্ট (popup)
app.MapGet("/api/summary", (HttpContext ctx, string? date, string? floor) =>
{
    var (me, err) = Auth(ctx, "staff"); if (err is not null) return err;
    var d = IsDate(date) ? date! : Db.Today();
    var f = ScopeFloor(me!, floor);
    using var c = Db.Open();
    var rows = DL(c.Query(
        @"SELECT ol.*, u.name AS user_name, o.status, o.shop_id, o.shop_name
            FROM dbo.order_lines ol
            JOIN dbo.orders o ON o.id = ol.order_id
            JOIN dbo.users  u ON u.id = o.user_id
           WHERE o.order_date = @d AND o.status <> 'cancelled' AND (@f IS NULL OR u.floor = @f)",
        new { d, f }));

    // দোকান → (জিনিস + রকম) ধরে যোগ
    var shops = new Dictionary<int, Dictionary<string, object?>>();
    var groupsByShop = new Dictionary<int, Dictionary<string, Dictionary<string, object?>>>();

    foreach (var r in rows)
    {
        var sid = r["shop_id"] is int s ? s : 0;
        if (!shops.TryGetValue(sid, out var shop))
        {
            shop = new Dictionary<string, object?>
            {
                ["shop_id"] = sid == 0 ? null : sid,
                ["shop_name"] = sid == 0 ? "দোকান বলা হয়নি" : (string?)r["shop_name"] ?? "",
                ["qty"] = 0,
                ["amount"] = 0m,
                ["people"] = new HashSet<string>(),
            };
            shops[sid] = shop;
            groupsByShop[sid] = new Dictionary<string, Dictionary<string, object?>>();
        }
        ((HashSet<string>)shop["people"]!).Add((string)r["user_name"]!);

        var map = groupsByShop[sid];
        var key = $"{r["item_id"]}|{r["option_id"] ?? 0}";
        if (!map.TryGetValue(key, out var g))
        {
            g = new Dictionary<string, object?>
            {
                ["item_id"] = r["item_id"],
                ["item_name"] = r["item_name"],
                ["option_name"] = r["option_name"],
                ["qty"] = 0,
                ["amount"] = 0m,
                ["unit_price"] = r["unit_price"],
                ["who"] = new List<string>(),
                ["fallbacks"] = new List<object>(),
            };
            map[key] = g;
        }
        g["qty"] = (int)g["qty"]! + (int)r["qty"]!;
        g["amount"] = M((decimal)g["amount"]! + (decimal)r["subtotal"]!);
        shop["qty"] = (int)shop["qty"]! + (int)r["qty"]!;
        shop["amount"] = M((decimal)shop["amount"]! + (decimal)r["subtotal"]!);
        ((List<string>)g["who"]!).Add($"{r["user_name"]} ({r["qty"]})");
        if ((string)r["fallback_type"]! != "skip" || !string.IsNullOrEmpty((string?)r["fallback_note"]))
            ((List<object>)g["fallbacks"]!).Add(new
            {
                user = r["user_name"],
                type = r["fallback_type"],
                name = r["fallback_name"],
                note = r["fallback_note"],
            });
    }

    foreach (var (sid, shop) in shops)
    {
        shop["people"] = ((HashSet<string>)shop["people"]!).Count;
        shop["groups"] = groupsByShop[sid].Values
            .OrderBy(g => (string)g["item_name"]!, bnCompare)
            .ThenBy(g => (string)g["option_name"]!, bnCompare)
            .ToList();
    }

    var shopList = shops.Values
        .OrderByDescending(s => (int)s["qty"]!)
        .ThenBy(s => (string)s["shop_name"]!, bnCompare)
        .ToList();

    var people = c.ExecuteScalar<int>(
        @"SELECT COUNT(*) FROM dbo.orders o JOIN dbo.users u ON u.id = o.user_id
           WHERE o.order_date = @d AND o.status <> 'cancelled' AND (@f IS NULL OR u.floor = @f)",
        new { d, f });

    return Results.Json(new
    {
        date = d,
        floor = f,
        people,
        total_qty = shopList.Sum(s => (int)s["qty"]!),
        total_amount = M(shopList.Sum(s => (decimal)s["amount"]!)),
        shops = shopList,
    });
});

/// <summary>
/// কাকে কী দিতে হবে — নাস্তা সাজানোর সময় স্টাফ এটা দেখেই প্লেট গোছাবেন।
/// PIN, তলা, দোকান আর কে কোনটা কয়টা নিয়েছে — সব একসাথে।
/// </summary>
app.MapGet("/api/plating", (HttpContext ctx, string? date, string? floor) =>
{
    var (me, err) = Auth(ctx, "staff"); if (err is not null) return err;
    var d = IsDate(date) ? date! : Db.Today();
    var f = ScopeFloor(me!, floor);
    using var c = Db.Open();

    var orders = DL(c.Query(
        @"SELECT o.id, o.total, o.status, o.note, o.shop_name, o.updated_at,
                 u.id AS user_id, u.name AS user_name, u.pin, u.floor
            FROM dbo.orders o JOIN dbo.users u ON u.id = o.user_id
           WHERE o.order_date = @d AND o.status <> 'cancelled' AND (@f IS NULL OR u.floor = @f)
           ORDER BY o.shop_name, u.floor, u.name", new { d, f }));

    var lines = DL(c.Query(
        @"SELECT ol.id, ol.order_id, ol.item_name, ol.option_name, ol.qty, ol.subtotal,
                 ol.fallback_type, ol.fallback_name, ol.fallback_note,
                 ol.missing, ol.sub_name, ol.sub_qty, ol.sub_unit_price, ol.sub_subtotal, ol.sub_note
            FROM dbo.order_lines ol JOIN dbo.orders o ON o.id = ol.order_id
            JOIN dbo.users u ON u.id = o.user_id
           WHERE o.order_date = @d AND o.status <> 'cancelled' AND (@f IS NULL OR u.floor = @f)
           ORDER BY ol.id", new { d, f }));

    foreach (var o in orders)
    {
        var mine = lines.Where(l => (int)l["order_id"]! == (int)o["id"]!).ToList();
        o["lines"] = mine;
        // পাওয়া যায়নি এমন লাইনে হাতে যাবে বদলি জিনিসটাই — প্লেটের সংখ্যা সেটাই
        o["qty"] = mine.Sum(l => (bool)l["missing"]! ? (int)l["sub_qty"]! : (int)l["qty"]!);
    }

    // টাকার হিসাব টাকার পাতার সাথে হুবহু এক খাতা থেকেই — দুই জায়গায় দুই অঙ্ক যেন না দেখায়
    var plateBooks = MoneyEntriesFor(c, orders.Select(o => (int)o["user_id"]!).ToList());
    foreach (var o in orders)
    {
        var uid = (int)o["user_id"]!;
        var st = Statement(plateBooks[uid], d, d);
        o["opening"] = st["opening"];
        o["balance"] = BalanceOf(uid);
        o["to_return"] = st["now"];
        o["paid_today"] = ((Dictionary<string, object?>)st["totals"]!)["deposit"];
    }

    return Results.Json(new
    {
        date = d,
        floor = f,
        people = orders.Count,
        total_qty = orders.Sum(o => (int)o["qty"]!),
        total_amount = M(orders.Sum(o => (decimal)o["total"]!)),
        orders,
    });
});

/// <summary>
/// কেউ মুখে বললে স্টাফ যেন PIN বা নাম খুঁজে সাথে সাথেই তার রোজকার অর্ডার বসাতে পারেন।
/// তাই এক কলেই নিজের তলার সবার নাম, PIN, রোজকার অর্ডার আর আজ দিয়েছে কি না — সব আসে।
/// </summary>
app.MapGet("/api/quick-users", (HttpContext ctx, string? date, string? floor) =>
{
    var (me, err) = Auth(ctx, "staff"); if (err is not null) return err;
    var d = IsDate(date) ? date! : Db.Today();
    var f = ScopeFloor(me!, floor);
    using var c = Db.Open();
    var rows = DL(c.Query(
        @"SELECT u.id, u.name, u.pin, u.floor, u.usual_json, u.default_shop_id,
                 o.id AS order_id, ISNULL(o.total, 0) AS total,
                 ISNULL((SELECT SUM(qty) FROM dbo.order_lines WHERE order_id = o.id), 0) AS qty
            FROM dbo.users u
            LEFT JOIN dbo.orders o
                   ON o.user_id = u.id AND o.order_date = @d AND o.status <> 'cancelled'
           WHERE u.active = 1 AND u.role = 'user' AND (@f IS NULL OR u.floor = @f)
           ORDER BY u.name", new { d, f }));

    foreach (var r in rows)
    {
        var favs = ReadFavs((string?)r["usual_json"]);
        r["favourites"] = favs;
        r["usual"] = favs.FirstOrDefault();        // পুরোনো ক্যাশে থাকা app.js-এর জন্য
        r.Remove("usual_json");
        r["balance"] = BalanceOf((int)r["id"]!);   // হাতে কত জমা আছে
    }
    return Results.Json(new { date = d, floor = f, users = rows });
});

/// <summary>
/// আজকের টাকার হিসাব — কাকে কত ফেরত দিতে হবে আর কার কাছে কত পাওনা।
/// নাস্তা দেওয়ার পর স্টাফ এটা দেখেই টাকা মিটিয়ে দেন।
/// </summary>
app.MapGet("/api/money-today", (HttpContext ctx, string? date, string? floor) =>
{
    var (me, err) = Auth(ctx, "staff"); if (err is not null) return err;
    var d = IsDate(date) ? date! : Db.Today();
    var f = ScopeFloor(me!, floor);
    using var c = Db.Open();

    var rows = DL(c.Query(
        @"SELECT u.id, u.name, u.pin, u.floor,
                 ISNULL(o.total, 0) AS order_total, o.status AS order_status,
                 ISNULL((SELECT SUM(amount) FROM dbo.ledger
                          WHERE user_id = u.id AND type = 'deposit' AND created_at LIKE @d + '%'), 0) AS paid_today,
                 ISNULL((SELECT SUM(amount) FROM dbo.ledger
                          WHERE user_id = u.id AND type = 'refund' AND created_at LIKE @d + '%'), 0) AS returned_today
            FROM dbo.users u
            LEFT JOIN dbo.orders o
                   ON o.user_id = u.id AND o.order_date = @d AND o.status <> 'cancelled'
           WHERE u.active = 1 AND u.role = 'user' AND (@f IS NULL OR u.floor = @f)
           ORDER BY u.name", new { d, f }));

    // সবার খাতা একবারে — "৫০ ফেরত" কোথা থেকে এল সেটা যেন স্টাফ দেখতে পান:
    // আগের জমা ২০০ → আগের দিনগুলোর নাস্তা বাদ → আজ দিলেন → আজকের নাস্তা → এখন কত
    var books = MoneyEntriesFor(c, rows.Select(r => (int)r["id"]!).ToList());
    foreach (var r in rows)
    {
        var book = books[(int)r["id"]!];
        var st = Statement(book, d, d);
        r["opening"] = st["opening"];              // আজ শুরুর আগে হাতে কত জমা ছিল
        r["balance"] = BalanceOf((int)r["id"]!);   // শুধু লেজার (দেওয়া বাকি অর্ডার ছাড়া)
        // এখন আসলে কত — যেসব অর্ডার এখনো দেওয়া হয়নি সেগুলোর দামও বাদ (আগের দিনেরও)
        r["to_return"] = st["now"];
    }

    var give = rows.Where(r => (decimal)r["to_return"]! > 0).ToList();
    var owe = rows.Where(r => (decimal)r["to_return"]! < 0).ToList();

    return Results.Json(new
    {
        date = d,
        floor = f,
        collected_today = M(rows.Sum(r => (decimal)r["paid_today"]!)),
        returned_today = M(rows.Sum(r => (decimal)r["returned_today"]!)),
        to_return_total = M(give.Sum(r => (decimal)r["to_return"]!)),
        owed_total = M(owe.Sum(r => -(decimal)r["to_return"]!)),
        give,
        owe,
        all = rows,
    });
});

/// <summary>স্টাফের ঘণ্টার জন্য — নিজের তলায় আজ কে কে অর্ডার দিল।</summary>
app.MapGet("/api/notifications", (HttpContext ctx, string? date, string? floor) =>
{
    var (me, err) = Auth(ctx, "staff"); if (err is not null) return err;
    var d = IsDate(date) ? date! : Db.Today();
    var f = ScopeFloor(me!, floor);
    using var c = Db.Open();
    var rows = DL(c.Query(
        @"SELECT TOP 50 o.id, o.total, o.status, o.shop_name, o.created_at, o.updated_at, o.accepted_at,
                 u.id AS user_id, u.name AS user_name, u.pin, u.floor,
                 (SELECT ISNULL(SUM(qty), 0) FROM dbo.order_lines WHERE order_id = o.id) AS qty
            FROM dbo.orders o JOIN dbo.users u ON u.id = o.user_id
           WHERE o.order_date = @d AND o.status <> 'cancelled' AND (@f IS NULL OR u.floor = @f)
           ORDER BY o.updated_at DESC", new { d, f }));
    return Results.Json(new { date = d, floor = f, count = rows.Count, items = rows });
});

// =============================================================== হিসাব
decimal BalanceOf(int userId)
{
    using var c = Db.Open();
    var rows = c.Query<(string type, decimal amount)>(
        "SELECT type, amount FROM dbo.ledger WHERE user_id = @u", new { u = userId });
    decimal bal = 0;
    foreach (var r in rows) bal += r.type is "deposit" or "adjust" ? r.amount : -r.amount;
    return M(bal);
}

app.MapGet("/api/ledger/my", (HttpContext ctx) =>
{
    var (me, err) = Auth(ctx); if (err is not null) return err;
    using var c = Db.Open();
    var rows = DL(c.Query("SELECT TOP 100 * FROM dbo.ledger WHERE user_id = @u ORDER BY id DESC", new { u = me!.id }));
    return Results.Json(new { balance = BalanceOf(me.id), rows });
});

// ------------------------------------------------------ টাকার খাতা (পাসবই)
/// <summary>
/// একজনের সব টাকার ঘটনা, সময় ধরে সাজানো — ব্যাংকের পাসবইয়ের মতো।
/// <para>
/// লেজারে থাকে জমা, ফেরত, সমন্বয় আর "দেওয়া হয়েছে" অর্ডারের খরচ। কিন্তু যে অর্ডার
/// এখনো দেওয়া হয়নি তার খরচ লেজারে বসে না — অথচ টাকাটা তো যাবেই। তাই সেগুলোও
/// "⏳ দেওয়া বাকি" হিসেবে ধরা হয়। নইলে ২০০ টাকা জমা দিয়ে তিন দিন খেলেও খাতায় ২০০-ই
/// দেখাত, আর স্টাফের "৫০ ফেরত" কোথা থেকে এল কেউ বুঝত না।
/// </para>
/// দুবার গোনা হয় না: দেওয়া হলে অর্ডারটা "বাকি" থেকে সরে গিয়ে লেজারের খরচ হয়ে যায়।
/// </summary>
Dictionary<int, List<Dictionary<string, object?>>> MoneyEntriesFor(IDbConnection c, ICollection<int> userIds)
{
    var map = userIds.Distinct().ToDictionary(id => id, _ => new List<Dictionary<string, object?>>());
    if (map.Count == 0) return map;
    var ids = map.Keys.ToList();

    foreach (var l in c.Query(
        @"SELECT l.id, l.user_id, l.type, l.amount, l.note, l.created_at, l.ref_order_id, o.order_date
            FROM dbo.ledger l LEFT JOIN dbo.orders o ON o.id = l.ref_order_id
           WHERE l.user_id IN @ids", new { ids }))
    {
        string type = l.type;
        decimal amt = l.amount;
        map[(int)l.user_id].Add(new Dictionary<string, object?>
        {
            ["at"] = (string)l.created_at,
            ["kind"] = type,
            // জমা আর সমন্বয় যোগ হয় (সমন্বয় নিজেই ঋণাত্মক হতে পারে); খরচ আর ফেরত বিয়োগ
            ["amount"] = M(type is "deposit" or "adjust" ? amt : -amt),
            ["note"] = (string)l.note,
            ["order_id"] = (int?)l.ref_order_id,
            ["order_date"] = (string?)l.order_date,
            ["ledger_id"] = (int)l.id,
            ["pending"] = false,
        });
    }

    foreach (var o in c.Query(
        @"SELECT id, user_id, order_date, total, status, shop_name, created_at FROM dbo.orders
           WHERE user_id IN @ids AND status NOT IN ('delivered', 'cancelled') AND total > 0", new { ids }))
    {
        map[(int)o.user_id].Add(new Dictionary<string, object?>
        {
            ["at"] = (string)o.created_at,
            ["kind"] = "pending",
            ["amount"] = M(-(decimal)o.total),
            ["note"] = (string)o.shop_name,
            ["order_id"] = (int)o.id,
            ["order_date"] = (string)o.order_date,
            ["ledger_id"] = null,
            ["pending"] = true,
            ["status"] = (string)o.status,
        });
    }

    foreach (var list in map.Values)
    {
        list.Sort((a, b) =>
        {
            var byTime = string.CompareOrdinal((string)a["at"]!, (string)b["at"]!);
            return byTime != 0 ? byTime : ((int?)a["ledger_id"] ?? int.MaxValue).CompareTo((int?)b["ledger_id"] ?? int.MaxValue);
        });
        decimal run = 0m;
        foreach (var r in list)
        {
            run = M(run + (decimal)r["amount"]!);
            r["balance"] = run;                      // এই ঘটনার পর হাতে কত রইল
            r["date"] = ((string)r["at"]!)[..10];
        }
    }
    return map;
}

/// <summary>
/// খাতার একটা সময়ের টুকরো: শুরুতে কত ছিল, মাঝের ঘটনাগুলো, শেষে কত রইল।
/// from/to না দিলে পুরো ইতিহাস।
/// </summary>
Dictionary<string, object?> Statement(List<Dictionary<string, object?>> all, string? from, string? to)
{
    decimal opening = 0m;
    var rows = new List<Dictionary<string, object?>>();
    foreach (var r in all)
    {
        var day = (string)r["date"]!;
        if (from is not null && string.CompareOrdinal(day, from) < 0) { opening = (decimal)r["balance"]!; continue; }
        if (to is not null && string.CompareOrdinal(day, to) > 0) continue;
        rows.Add(r);
    }
    decimal Sum(string kind, bool negate = false) =>
        M(rows.Where(r => (string)r["kind"]! == kind).Sum(r => negate ? -(decimal)r["amount"]! : (decimal)r["amount"]!));

    var charge = Sum("charge", negate: true);
    var pending = Sum("pending", negate: true);
    return new Dictionary<string, object?>
    {
        ["from"] = from,
        ["to"] = to,
        ["opening"] = opening,
        ["closing"] = rows.Count > 0 ? (decimal)rows[^1]["balance"]! : opening,
        ["now"] = all.Count > 0 ? (decimal)all[^1]["balance"]! : 0m,
        ["rows"] = rows,
        ["totals"] = new Dictionary<string, object?>
        {
            ["deposit"] = Sum("deposit"),
            ["refund"] = Sum("refund", negate: true),
            ["adjust"] = Sum("adjust"),
            ["charge"] = charge,
            ["pending"] = pending,
            // খেয়েছেন = দেওয়া হয়ে গেছে + এখনো দেওয়া বাকি (বাতিল অর্ডার এখানে আসেই না)
            ["food"] = M(charge + pending),
            ["food_days"] = rows.Where(r => (string)r["kind"]! is "charge" or "pending" && r["order_date"] is string)
                                .Select(r => (string)r["order_date"]!).Distinct().Count(),
        },
    };
}

/// <summary>
/// টাকার খাতা। ইউজার নিজেরটা দেখেন; স্টাফ নিজের তলার কারো user_id দিয়ে তারটা।
/// from/to (yyyy-MM-dd) দিলে ওই সময়টুকু, সাথে শুরুর জের আর সব সময়ের মোট।
/// </summary>
app.MapGet("/api/ledger/statement", (HttpContext ctx, int? user_id, string? from, string? to) =>
{
    var (me, err) = Auth(ctx); if (err is not null) return err;
    var uid = me!.id;
    if (user_id is int u && u != me.id)
    {
        if (me.role == "user") return Fail(403, "এটা আপনার হিসাব না");
        var fErr = NotMyFloor(me, u); if (fErr is not null) return fErr;
        uid = u;
    }
    using var c = Db.Open();
    var who = c.QueryFirstOrDefault("SELECT id, name, pin, floor FROM dbo.users WHERE id = @i", new { i = uid });
    if (who is null) return Fail(404, "ইউজার নেই");

    var all = MoneyEntriesFor(c, new[] { uid })[uid];
    var period = Statement(all, IsDate(from) ? from : null, IsDate(to) ? to : null);
    var ever = Statement(all, null, null);
    period["user"] = D(who);
    period["ever"] = ever["totals"];
    period["ledger_balance"] = BalanceOf(uid);
    return Results.Json(period);
});

app.MapGet("/api/ledger/balances", (HttpContext ctx, string? floor) =>
{
    var (me, err) = Auth(ctx, "staff"); if (err is not null) return err;
    var f = ScopeFloor(me!, floor);
    using var c = Db.Open();
    var rows = DL(c.Query(
        @"SELECT u.id, u.name, u.role, u.floor,
                 ISNULL(SUM(CASE WHEN l.type='deposit' THEN l.amount END), 0) AS deposit,
                 ISNULL(SUM(CASE WHEN l.type='charge'  THEN l.amount END), 0) AS charge,
                 ISNULL(SUM(CASE WHEN l.type='refund'  THEN l.amount END), 0) AS refund,
                 ISNULL(SUM(CASE WHEN l.type='adjust'  THEN l.amount END), 0) AS adjust
            FROM dbo.users u LEFT JOIN dbo.ledger l ON l.user_id = u.id
           WHERE u.active = 1 AND (@f IS NULL OR u.floor = @f)
           GROUP BY u.id, u.name, u.role, u.floor
           ORDER BY u.floor, u.name", new { f }));
    // সবার পাতায় একই অঙ্ক দেখাতে — দেওয়া বাকি অর্ডারের দামও বাদ দিয়ে "এখন কত"
    var books = MoneyEntriesFor(c, rows.Select(r => (int)r["id"]!).ToList());
    foreach (var r in rows)
    {
        r["balance"] = M((decimal)r["deposit"]! + (decimal)r["adjust"]! - (decimal)r["charge"]! - (decimal)r["refund"]!);
        var book = books[(int)r["id"]!];
        r["pending"] = M(book.Where(x => (bool)x["pending"]!).Sum(x => -(decimal)x["amount"]!));
        r["now"] = book.Count > 0 ? (decimal)book[^1]["balance"]! : 0m;
    }
    return Results.Json(rows);
});

app.MapGet("/api/ledger/user/{id:int}", (HttpContext ctx, int id) =>
{
    var (me, err) = Auth(ctx, "staff"); if (err is not null) return err;
    var fErr = NotMyFloor(me!, id); if (fErr is not null) return fErr;
    using var c = Db.Open();
    var rows = DL(c.Query("SELECT * FROM dbo.ledger WHERE user_id = @u ORDER BY id DESC", new { u = id }));
    var u = c.QueryFirstOrDefault("SELECT id, name FROM dbo.users WHERE id = @i", new { i = id });
    return Results.Json(new { user = u is null ? null : D(u), balance = BalanceOf(id), rows });
});

app.MapPost("/api/ledger", (HttpContext ctx, LedgerReq b) =>
{
    var (me, err) = Auth(ctx, "staff"); if (err is not null) return err;
    var type = b.type ?? "";
    if (type is not ("deposit" or "refund" or "adjust")) return Fail(400, "ভুল ধরন");
    var fErr = NotMyFloor(me!, b.user_id ?? 0); if (fErr is not null) return fErr;
    var amount = M(b.amount ?? 0);
    if (amount == 0) return Fail(400, "টাকার অঙ্ক দিন");
    if (type != "adjust" && amount < 0) return Fail(400, "ধনাত্মক অঙ্ক দিন");

    using var c = Db.Open();
    if (c.ExecuteScalar<int>("SELECT COUNT(*) FROM dbo.users WHERE id = @i", new { i = b.user_id ?? 0 }) == 0)
        return Fail(400, "ইউজার নেই");
    c.Execute(
        @"INSERT INTO dbo.ledger(user_id, type, amount, note, created_by, created_at)
          VALUES(@u, @ty, @a, @n, @b, @t)",
        new { u = b.user_id, ty = type, a = amount, n = (b.note ?? "").Trim(), b = me!.id, t = Db.Stamp() });
    return Results.Json(new { ok = true, balance = BalanceOf(b.user_id!.Value) });
});

app.MapPost("/api/ledger/refund-all", (HttpContext ctx, RefundAllReq b) =>
{
    var (me, err) = Auth(ctx, "staff"); if (err is not null) return err;
    var uid = b.user_id ?? 0;
    var fErr = NotMyFloor(me!, uid); if (fErr is not null) return fErr;
    using var c = Db.Open();
    // শুধু লেজারের অঙ্ক ফেরত দিলে বেশি চলে যেত — যে অর্ডার এখনো দেওয়া হয়নি তার
    // দামটাও তো ওই টাকা থেকেই যাবে। তাই খাতার "এখন কত" অঙ্কটাই ফেরত।
    var book = MoneyEntriesFor(c, new[] { uid })[uid];
    var bal = book.Count > 0 ? (decimal)book[^1]["balance"]! : 0m;
    if (bal <= 0) return Fail(400, "ফেরত দেওয়ার মতো টাকা নেই");
    c.Execute(
        @"INSERT INTO dbo.ledger(user_id, type, amount, note, created_by, created_at)
          VALUES(@u, 'refund', @a, @n, @b, @t)",
        new { u = uid, a = bal, n = b.note ?? "পুরো ব্যালেন্স ফেরত", b = me!.id, t = Db.Stamp() });
    return Results.Json(new { ok = true, balance = BalanceOf(uid), refunded = bal });
});

app.MapDelete("/api/ledger/{id:int}", (HttpContext ctx, int id) =>
{
    var (_, err) = Auth(ctx, "staff"); if (err is not null) return err;
    using var c = Db.Open();
    var row = c.QueryFirstOrDefault("SELECT * FROM dbo.ledger WHERE id = @i", new { i = id });
    if (row is null) return Fail(404, "এন্ট্রি নেই");
    if ((string)row.type == "charge") return Fail(400, "অর্ডারের খরচ এখান থেকে মোছা যাবে না");
    c.Execute("DELETE FROM dbo.ledger WHERE id = @i", new { i = id });
    return Results.Json(new { ok = true, balance = BalanceOf((int)row.user_id) });
});

// =============================================================== রিপোর্ট
app.MapGet("/api/report", (HttpContext ctx, string? from, string? to, string? floor) =>
{
    var (me, err) = Auth(ctx, "staff"); if (err is not null) return err;
    var f = IsDate(from) ? from! : Db.Today();
    var t = IsDate(to) ? to! : Db.Today();
    var fl = ScopeFloor(me!, floor);
    using var c = Db.Open();

    var days = DL(c.Query(
        @"SELECT o.order_date, COUNT(*) AS people, ISNULL(SUM(o.total), 0) AS amount
            FROM dbo.orders o JOIN dbo.users u ON u.id = o.user_id
           WHERE o.order_date BETWEEN @f AND @t AND o.status <> 'cancelled' AND (@fl IS NULL OR u.floor = @fl)
           GROUP BY o.order_date ORDER BY o.order_date DESC", new { f, t, fl }));

    var byItem = DL(c.Query(
        @"SELECT ol.item_name, ol.option_name, SUM(ol.qty) AS qty, SUM(ol.subtotal) AS amount
            FROM dbo.order_lines ol
            JOIN dbo.orders o ON o.id = ol.order_id
            JOIN dbo.users  u ON u.id = o.user_id
           WHERE o.order_date BETWEEN @f AND @t AND o.status <> 'cancelled' AND (@fl IS NULL OR u.floor = @fl)
           GROUP BY ol.item_name, ol.option_name ORDER BY SUM(ol.qty) DESC", new { f, t, fl }));

    var byUser = DL(c.Query(
        @"SELECT u.id, u.name, u.floor, COUNT(o.id) AS days, ISNULL(SUM(o.total), 0) AS amount
            FROM dbo.orders o JOIN dbo.users u ON u.id = o.user_id
           WHERE o.order_date BETWEEN @f AND @t AND o.status <> 'cancelled' AND (@fl IS NULL OR u.floor = @fl)
           GROUP BY u.id, u.name, u.floor ORDER BY SUM(o.total) DESC", new { f, t, fl }));

    var byShop = DL(c.Query(
        @"SELECT CASE WHEN o.shop_name = N'' THEN N'দোকান বলা হয়নি' ELSE o.shop_name END AS shop_name,
                 COUNT(*) AS orders, ISNULL(SUM(o.total), 0) AS amount
            FROM dbo.orders o JOIN dbo.users u ON u.id = o.user_id
           WHERE o.order_date BETWEEN @f AND @t AND o.status <> 'cancelled' AND (@fl IS NULL OR u.floor = @fl)
           GROUP BY o.shop_name ORDER BY SUM(o.total) DESC", new { f, t, fl }));

    // দোকান ধরে কোন জিনিস কয়টা — দোকানে গিয়ে এক নজরে দেখার জন্য
    var byShopItem = DL(c.Query(
        @"SELECT CASE WHEN o.shop_name = N'' THEN N'দোকান বলা হয়নি' ELSE o.shop_name END AS shop_name,
                 ol.item_name, ol.option_name, SUM(ol.qty) AS qty, SUM(ol.subtotal) AS amount
            FROM dbo.order_lines ol
            JOIN dbo.orders o ON o.id = ol.order_id
            JOIN dbo.users  u ON u.id = o.user_id
           WHERE o.order_date BETWEEN @f AND @t AND o.status <> 'cancelled' AND (@fl IS NULL OR u.floor = @fl)
           GROUP BY o.shop_name, ol.item_name, ol.option_name
           ORDER BY o.shop_name, SUM(ol.qty) DESC", new { f, t, fl }));

    return Results.Json(new
    {
        from = f,
        to = t,
        floor = fl,
        total_amount = M(days.Sum(d => (decimal)d["amount"]!)),
        total_days = days.Count,
        days,
        byItem,
        byUser,
        byShop,
        byShopItem,
    });
});

// =============================================================== ইউজার
app.MapGet("/api/users", (HttpContext ctx, string? floor) =>
{
    var (me, err) = Auth(ctx, "staff"); if (err is not null) return err;
    var f = ScopeFloor(me!, floor);
    using var c = Db.Open();
    // স্টাফ শুধু নিজের তলার লোক দেখেন; সুপার অ্যাডমিন সবাইকে
    return Results.Json(DL(c.Query(
        @"SELECT id, name, pin, floor, role, active, created_at FROM dbo.users
           WHERE (@f IS NULL OR floor = @f OR role = 'super_admin')
           ORDER BY role, floor, name", new { f })));
});

app.MapPost("/api/users", (HttpContext ctx, UserReq b) =>
{
    var (_, err) = Auth(ctx, "admin"); if (err is not null) return err;
    var name = (b.name ?? "").Trim();
    var pass = b.password ?? "";
    var pin = (b.pin ?? "").Trim();
    var role = b.role is "user" or "staff" or "super_admin" ? b.role! : "user";
    if (name.Length < 2) return Fail(400, "নাম দিন");
    if (pass.Length < 4) return Fail(400, "পাসওয়ার্ড কমপক্ষে ৪ অক্ষর");
    var pinErr = BadPin(pin); if (pinErr is not null) return pinErr;
    using var c = Db.Open();
    // নাম মিলে গেলেও সমস্যা নেই — PIN আলাদা হলেই হলো
    var floor = role == "super_admin" ? null : b.floor;
    if (role != "super_admin" && (floor is not int ff || !Floors().Contains(ff)))
        return Fail(400, "কোন তলার লোক সেটা বেছে দিন");

    var id = c.ExecuteScalar<int>(
        @"INSERT INTO dbo.users(name, pin, floor, password_hash, role, created_at)
          VALUES(@n, @pin, @f, @p, @r, @t); SELECT CAST(SCOPE_IDENTITY() AS INT);",
        new { n = name, pin, f = floor, p = BCrypt.Net.BCrypt.HashPassword(pass), r = role, t = Db.Stamp() });
    return Results.Json(new { ok = true, id });
});

app.MapPatch("/api/users/{id:int}", (HttpContext ctx, int id, UserReq b) =>
{
    var (me, err) = Auth(ctx, "admin"); if (err is not null) return err;
    using var c = Db.Open();
    var u = c.QueryFirstOrDefault("SELECT * FROM dbo.users WHERE id = @i", new { i = id });
    if (u is null) return Fail(404, "ইউজার নেই");

    if (b.name is not null)
    {
        var name = b.name.Trim();
        if (name.Length < 2) return Fail(400, "নাম কমপক্ষে ২ অক্ষর");
        // এক নামে দুজন থাকতে পারে — তাই নাম মিলিয়ে দেখার দরকার নেই
        c.Execute("UPDATE dbo.users SET name = @n WHERE id = @i", new { n = name, i = id });
    }
    if (!string.IsNullOrWhiteSpace(b.pin))
    {
        var pin = b.pin.Trim();
        var pinErr = BadPin(pin, id); if (pinErr is not null) return pinErr;
        c.Execute("UPDATE dbo.users SET pin = @p WHERE id = @i", new { p = pin, i = id });
    }
    if (b.role is "user" or "staff" or "super_admin")
    {
        if ((string)u.role == "super_admin" && b.role != "super_admin" &&
            c.ExecuteScalar<int>("SELECT COUNT(*) FROM dbo.users WHERE role='super_admin' AND active=1") <= 1)
            return Fail(400, "অন্তত একজন সুপার অ্যাডমিন থাকতে হবে");
        c.Execute("UPDATE dbo.users SET role = @r WHERE id = @i", new { r = b.role, i = id });
    }
    if (b.floor.HasValue)
    {
        // স্টাফের তলা বদলায় — এখান থেকেই বদলে দেওয়া যায়
        if (!Floors().Contains(b.floor.Value)) return Fail(400, "এই তলা নেই");
        c.Execute("UPDATE dbo.users SET floor = @f WHERE id = @i", new { f = b.floor.Value, i = id });
    }
    if (b.active.HasValue)
    {
        if (id == me!.id && b.active.Value == 0) return Fail(400, "নিজেকে বন্ধ করা যাবে না");
        c.Execute("UPDATE dbo.users SET active = @a WHERE id = @i", new { a = b.active.Value != 0, i = id });
    }
    if (!string.IsNullOrEmpty(b.password))
    {
        if (b.password.Length < 4) return Fail(400, "পাসওয়ার্ড ছোট");
        c.Execute("UPDATE dbo.users SET password_hash = @p WHERE id = @i",
            new { p = BCrypt.Net.BCrypt.HashPassword(b.password), i = id });
        c.Execute("DELETE FROM dbo.sessions WHERE user_id = @i", new { i = id });
    }
    return Results.Json(new { ok = true });
});

/// <summary>
/// ইউজার একেবারে মুছে ফেলা — তার অর্ডার, লাইন আর টাকার হিসাবসহ।
/// অ্যাকাউন্ট শুধু বন্ধ রাখতে চাইলে মোছার দরকার নেই, PATCH দিয়ে active = 0 করুন
/// (তখন পুরোনো রিপোর্টে তার হিসাব থেকে যায়)।
/// </summary>
app.MapDelete("/api/users/{id:int}", (HttpContext ctx, int id) =>
{
    var (me, err) = Auth(ctx, "admin"); if (err is not null) return err;
    if (id == me!.id) return Fail(400, "নিজেকে মোছা যাবে না");
    using var c = Db.Open();
    var u = c.QueryFirstOrDefault("SELECT role FROM dbo.users WHERE id = @i", new { i = id });
    if (u is null) return Fail(404, "ইউজার নেই");
    // শেষ সুপার অ্যাডমিনকে মুছে ফেললে আর কেউ ঢুকতেই পারবে না
    if ((string)u.role == "super_admin" &&
        c.ExecuteScalar<int>("SELECT COUNT(*) FROM dbo.users WHERE role = 'super_admin' AND id <> @i",
            new { i = id }) == 0)
        return Fail(400, "অন্তত একজন সুপার অ্যাডমিন থাকতে হবে");

    c.Execute("DELETE FROM dbo.sessions WHERE user_id = @i", new { i = id });
    c.Execute("DELETE FROM dbo.ledger WHERE user_id = @i", new { i = id });
    c.Execute(
        @"DELETE FROM dbo.order_lines
           WHERE order_id IN (SELECT id FROM dbo.orders WHERE user_id = @i);", new { i = id });
    c.Execute("DELETE FROM dbo.orders WHERE user_id = @i", new { i = id });
    c.Execute("UPDATE dbo.day_status SET updated_by = NULL WHERE updated_by = @i", new { i = id });
    c.Execute("UPDATE dbo.ledger SET created_by = NULL WHERE created_by = @i", new { i = id });
    c.Execute("UPDATE dbo.orders SET accepted_by = NULL WHERE accepted_by = @i", new { i = id });
    c.Execute("UPDATE dbo.orders SET cancelled_by = NULL WHERE cancelled_by = @i", new { i = id });
    c.Execute("DELETE FROM dbo.users WHERE id = @i", new { i = id });
    return Results.Json(new { ok = true });
});

// =============================================================== সেটিংস
app.MapGet("/api/settings", (HttpContext ctx) =>
{
    var (_, err) = Auth(ctx, "admin"); if (err is not null) return err;
    return Results.Json(Db.GetSettings());
});

app.MapPut("/api/settings", (HttpContext ctx, SettingsReq b) =>
{
    var (_, err) = Auth(ctx, "admin"); if (err is not null) return err;
    var patch = new Dictionary<string, string>();
    if (b.office_name is not null) patch["office_name"] = b.office_name.Trim();
    if (b.money_module.HasValue) patch["money_module"] = b.money_module.Value != 0 ? "1" : "0";
    if (b.allow_register.HasValue) patch["allow_register"] = b.allow_register.Value != 0 ? "1" : "0";
    if (b.floors is not null)
    {
        var list = b.floors.Split(',', StringSplitOptions.RemoveEmptyEntries)
            .Select(x => int.TryParse(x.Trim(), out var n) ? n : 0)
            .Where(n => n > 0).Distinct().OrderBy(n => n).ToList();
        if (list.Count == 0) return Fail(400, "অন্তত একটা তলা দিন (যেমন: 2,3,4,5)");
        patch["floors"] = string.Join(",", list);
    }
    Db.SaveSettings(patch);
    return Results.Json(new { ok = true, settings = Db.GetSettings() });
});

// =============================================================== SPA
app.MapFallbackToFile("index.html");

app.Run();

// --------------------------------------------------------- মডেল
record Me(int id, string name, string role, string pin, int? floor);

// --------------------------------------------------------- রিকোয়েস্ট মডেল
record RegisterReq(string? name, string? pin, int? floor, string? password);
record LoginReq(string? pin, string? password);
record PwdReq(string? old_password, string? new_password);
record OptionDto(string? name, decimal? price_delta, int? is_default);
record ItemReq(string? name, decimal? price, string? category, int? sort_order, int? active, int? available,
    List<OptionDto>? options, List<ItemShopPriceDto>? shop_prices);
/// <summary>আইটেম পাতা থেকে দোকান ধরে দাম — দাম খালি/০ মানে ওই দোকানে জিনিসটা নেই।</summary>
record ItemShopPriceDto(int? shop_id, decimal? price);
record AvailReq(int? available);
record LineDto(int? item_id, int? option_id, int? qty, string? fallback_type, int? fallback_item_id,
    string? fallback_note);
record OrderReq(string? date, int? user_id, int? shop_id, string? note, List<LineDto>? lines);
record UsualReq(int? user_id, int? shop_id, List<LineDto>? lines);
/// <summary>একটা প্রিয় নাস্তা যেভাবে সেভ থাকে — নাম দিয়েই চেনা যায়।</summary>
record FavDto(int id, string? name, int? shop_id, List<LineDto> lines);
record FavReq(int? id, string? name, int? user_id, int? shop_id, List<LineDto>? lines);
record ShopReq(string? name, int? active, int? sort_order);
record ShopPriceDto(int? item_id, decimal? price, int? available);
record ShopPricesReq(List<ShopPriceDto>? prices);
record StatusReq(string? date, int? floor, string? status, string? message);
record OStatusReq(string? status);
record AcceptReq(bool? accepted);
record SubReq(bool? missing, int? item_id, string? name, decimal? unit_price, int? qty, string? note);
record DeliverAllReq(string? date, int? floor);
record LedgerReq(int? user_id, string? type, decimal? amount, string? note);
record RefundAllReq(int? user_id, string? note);
record UserReq(string? name, string? pin, int? floor, string? role, string? password, int? active);
record SettingsReq(string? office_name, int? money_module, int? allow_register, string? floors);
