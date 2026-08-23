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
const string LATE = " — তবুও অর্ডার করলে একটু সময় লাগতে পারে";
var DAY_STATUS = new Dictionary<string, object>
{
    ["open"] = new { label = "অর্ডার নেওয়া হচ্ছে", icon = "🟢", tone = "ok", canOrder = true,
                     late = false, lateMsg = "" },
    ["closed"] = new { label = "অর্ডার নেওয়া বন্ধ", icon = "🔴", tone = "warn", canOrder = true,
                       late = true, lateMsg = "অর্ডার নেওয়া বন্ধ হয়ে গেছে" + LATE },
    ["buying"] = new { label = "বাজারে যাওয়া হয়েছে", icon = "🛵", tone = "info", canOrder = true,
                       late = true, lateMsg = "নাস্তা কিনতে চলে গেছে" + LATE },
    ["arrived"] = new { label = "নাস্তা চলে এসেছে", icon = "📦", tone = "info", canOrder = true,
                        late = true, lateMsg = "নাস্তা চলে এসেছে" + LATE },
    ["served"] = new { label = "নাস্তা পরিবেশন করা হয়েছে", icon = "✅", tone = "ok", canOrder = true,
                       late = true, lateMsg = "নাস্তা পরিবেশন হয়ে গেছে" + LATE },
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

/// <summary>ইউজার এখন অর্ডার বদলাতে পারবে কি না। সময়ের কোনো সীমা নেই।</summary>
bool OrderLocked(dynamic? order, Me me, string date)
{
    if (me.role != "user") return false;
    if (order is not null && (string)order.status != "pending") return true;
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
    }
    var st = DayStatus(date, floor);
    if (st is not null && !(bool)st["canOrder"]!) return $"{st["icon"]} {st["label"]}";
    return "";
}

/// <summary>দেরি হয়ে গেলে ইউজারকে যে কথাটা দেখানো হবে (অর্ডার তবু করা যাবে)।</summary>
string LateNote(string date, int? floor)
{
    var st = DayStatus(date, floor);
    return st is not null && (bool)st["late"]! ? $"{st["icon"]} {st["lateMsg"]}" : "";
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
        var mine = prices.Where(p => (int)p["item_id"]! == id).ToList();
        // { "3": 18.00 } — দোকান-আইডি ধরে দাম; না থাকলে items.price
        it["shop_prices"] = mine.Where(p => (bool)p["available"]!)
            .ToDictionary(p => p["shop_id"]!.ToString()!, p => (decimal)p["price"]!);
        // যে দোকানগুলোয় জিনিসটা পাওয়াই যায় না
        it["shop_missing"] = mine.Where(p => !(bool)p["available"]!)
            .Select(p => (int)p["shop_id"]!).ToList();
    }
    return items;
}

/// <summary>এই দোকানে জিনিসটা পাওয়া যায় কি না।</summary>
bool SoldAt(Dictionary<string, object?> item, int? shopId) =>
    shopId is not int sid || item["shop_missing"] is not List<int> miss || !miss.Contains(sid);

List<Dictionary<string, object?>> LoadShops(bool onlyActive = true)
{
    using var c = Db.Open();
    return DL(c.Query(
        $"SELECT * FROM dbo.shops {(onlyActive ? "WHERE active = 1" : "")} ORDER BY sort_order, id"));
}

/// <summary>এই দোকানে এই জিনিসের দাম; দোকানের আলাদা দাম না থাকলে সাধারণ দাম।</summary>
decimal PriceOf(Dictionary<string, object?> item, int? shopId)
{
    if (shopId is int sid &&
        item["shop_prices"] is Dictionary<string, decimal> sp &&
        sp.TryGetValue(sid.ToString(), out var p)) return p;
    return (decimal)item["price"]!;
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

/// <summary>PIN যাচাই — ৪–৬ সংখ্যা, আর কারো সাথে মিলতে পারবে না।</summary>
IResult? BadPin(string pin, int? exceptUserId = null)
{
    if (!System.Text.RegularExpressions.Regex.IsMatch(pin, @"^\d{4,6}$"))
        return Fail(400, "PIN হবে ৪ থেকে ৬ সংখ্যার (শুধু নম্বর)");
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
    if (c.ExecuteScalar<int>("SELECT COUNT(*) FROM dbo.users WHERE name = @n", new { n = name }) > 0)
        return Fail(400, "এই নামে একজন আছেন — অন্য নাম দিন");

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
    // PIN দিয়ে, অথবা নাম দিয়েও (অ্যাডমিন "admin" দিয়ে ঢোকেন)
    var who = (b.pin ?? "").Trim();
    var u = c.QueryFirstOrDefault("SELECT * FROM dbo.users WHERE pin = @p OR name = @p", new { p = who });
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

/// <summary>এক দোকানের সব দাম একসাথে সেভ — দাম খালি দিলে সাধারণ দামই চলবে।</summary>
app.MapPut("/api/shops/{id:int}/prices", (HttpContext ctx, int id, ShopPricesReq b) =>
{
    var (_, err) = Auth(ctx, "staff"); if (err is not null) return err;
    using var c = Db.Open();
    if (c.ExecuteScalar<int>("SELECT COUNT(*) FROM dbo.shops WHERE id = @i", new { i = id }) == 0)
        return Fail(404, "দোকান নেই");

    foreach (var p in b.prices ?? new List<ShopPriceDto>())
    {
        if (p.item_id is not int itemId) continue;
        var missing = (p.available ?? 1) == 0;
        var price = p.price is decimal v && v > 0 ? M(v) : (decimal?)null;

        // দাম-ও নেই, "নেই"-ও বলা হয়নি → সাধারণ দামই চলবে, তাই সারিটাই দরকার নেই
        if (!missing && price is null)
        {
            c.Execute("DELETE FROM dbo.item_prices WHERE item_id = @i AND shop_id = @s",
                new { i = itemId, s = id });
            continue;
        }
        c.Execute(
            @"UPDATE dbo.item_prices SET price = @p, available = @a WHERE item_id = @i AND shop_id = @s;
              IF @@ROWCOUNT = 0
              INSERT INTO dbo.item_prices(item_id, shop_id, price, available) VALUES(@i, @s, @p, @a);",
            new { i = itemId, s = id, p = price ?? 0m, a = !missing });
    }
    return Results.Json(new { ok = true });
});

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
    return d;
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

    var o = c.QueryFirstOrDefault("SELECT * FROM dbo.orders WHERE user_id = @u AND order_date = @d",
        new { u = target.id, d });
    var prof = c.QueryFirstOrDefault("SELECT default_shop_id, usual_json FROM dbo.users WHERE id = @i",
        new { i = target.id });

    return Results.Json(new
    {
        date = d,
        now = Db.NowTime(),
        status = DayStatus(d, target.floor),
        locked = OrderLocked(o, actor, d),
        lock_reason = LockReason(d, target.floor, o),
        late_note = LateNote(d, target.floor),
        order = Hydrate(o),
        for_user = target.id == actor.id ? null : new { target.id, target.name, target.floor },
        default_shop_id = (int?)prof?.default_shop_id,
        usual = ParseUsual((string?)prof?.usual_json),
    });
});

/// <summary>রোজকার বাঁধা অর্ডার — নষ্ট JSON হলে চুপচাপ খালি ধরা হয়।</summary>
static object? ParseUsual(string? json)
{
    if (string.IsNullOrWhiteSpace(json)) return null;
    try { return JsonSerializer.Deserialize<JsonElement>(json); } catch { return null; }
}

/// <summary>রোজকার অর্ডার সেভ। স্টাফ চাইলে নিজের তলার কারো জন্যও সেভ করতে পারেন।</summary>
app.MapPut("/api/me/usual", (HttpContext ctx, UsualReq b) =>
{
    var (me, err) = Auth(ctx); if (err is not null) return err;
    var uid = UsualTarget(me!, b.user_id, out var uErr); if (uErr is not null) return uErr;
    var json = JsonSerializer.Serialize(new { shop_id = b.shop_id, lines = b.lines ?? new List<LineDto>() });
    using var c = Db.Open();
    c.Execute("UPDATE dbo.users SET usual_json = @j WHERE id = @i", new { j = json, i = uid });
    return Results.Json(new { ok = true });
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

app.MapGet("/api/orders/history", (HttpContext ctx) =>
{
    var (me, err) = Auth(ctx); if (err is not null) return err;
    using var c = Db.Open();
    var rows = c.Query(
        @"SELECT TOP 60 id, order_date, status, total FROM dbo.orders
           WHERE user_id = @u ORDER BY order_date DESC", new { u = me!.id });
    return Results.Json(rows.Select(r => Hydrate(r)).ToList());
});

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

    foreach (var l in b.lines ?? new List<LineDto>())
    {
        if (!items.TryGetValue(l.item_id ?? 0, out var item)) continue;
        if (!SoldAt(item, shopId)) continue;   // এই দোকানে জিনিসটা নেই
        var qty = Math.Clamp(l.qty ?? 0, 0, 99);
        if (qty == 0) continue;

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

    var total = M(prepared.Sum(p => (decimal)p["subtotal"]!));
    int orderId;
    if (existing is not null)
    {
        orderId = (int)existing.id;
        c.Execute("UPDATE dbo.orders SET note=@n, total=@t, shop_id=@sid, shop_name=@sn, updated_at=@u WHERE id=@i",
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

    if (prepared.Count == 0)
    {
        c.Execute("DELETE FROM dbo.ledger WHERE ref_order_id = @o", new { o = orderId });
        c.Execute("DELETE FROM dbo.orders WHERE id = @i", new { i = orderId });
    }
    else SyncCharge(orderId);

    // পরেরবার যেন দোকানটা নিজে থেকেই বাছা থাকে — একটা ক্লিক কম
    if (shopId is not null)
        c.Execute("UPDATE dbo.users SET default_shop_id = @s WHERE id = @i",
            new { s = shopId, i = targetUserId });

    return Results.Json(new { ok = true, id = orderId, total });
});

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
    c.Execute("DELETE FROM dbo.ledger WHERE ref_order_id = @o", new { o = id });
    c.Execute("DELETE FROM dbo.order_lines WHERE order_id = @o", new { o = id });
    c.Execute("DELETE FROM dbo.orders WHERE id = @i", new { i = id });
    return Results.Json(new { ok = true });
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
        @"SELECT ol.order_id, ol.item_name, ol.option_name, ol.qty, ol.subtotal,
                 ol.fallback_type, ol.fallback_name, ol.fallback_note
            FROM dbo.order_lines ol JOIN dbo.orders o ON o.id = ol.order_id
            JOIN dbo.users u ON u.id = o.user_id
           WHERE o.order_date = @d AND o.status <> 'cancelled' AND (@f IS NULL OR u.floor = @f)
           ORDER BY ol.id", new { d, f }));

    foreach (var o in orders)
    {
        var mine = lines.Where(l => (int)l["order_id"]! == (int)o["id"]!).ToList();
        o["lines"] = mine;
        o["qty"] = mine.Sum(l => (int)l["qty"]!);

        // হাতে কত টাকা দিয়েছিলেন আর নাস্তা দেওয়ার সময় কত ফেরত দিতে হবে
        var uid = (int)o["user_id"]!;
        var bal = BalanceOf(uid);
        // খরচ বসে শুধু "দেওয়া হয়েছে" হলে — তাই তার আগে খরচটা হাতে বাদ দিয়ে হিসাব
        var pending = (string)o["status"]! == "delivered" ? 0m : (decimal)o["total"]!;
        o["balance"] = bal;
        o["to_return"] = M(bal - pending);
        o["paid_today"] = c.ExecuteScalar<decimal>(
            @"SELECT ISNULL(SUM(amount), 0) FROM dbo.ledger
               WHERE user_id = @u AND type = 'deposit' AND created_at LIKE @d + '%'",
            new { u = uid, d });
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
        r["usual"] = ParseUsual((string?)r["usual_json"]);
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

    foreach (var r in rows)
    {
        var bal = BalanceOf((int)r["id"]!);
        // খরচ বসে শুধু "দেওয়া হয়েছে" হলে — তার আগে দামটা হাতে বাদ দিয়ে হিসাব
        var pending = (string?)r["order_status"] == "delivered" ? 0m : (decimal)r["order_total"]!;
        r["balance"] = bal;
        r["to_return"] = M(bal - pending);
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
        @"SELECT TOP 50 o.id, o.total, o.status, o.shop_name, o.created_at, o.updated_at,
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
    foreach (var r in rows)
        r["balance"] = M((decimal)r["deposit"]! + (decimal)r["adjust"]! - (decimal)r["charge"]! - (decimal)r["refund"]!);
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
    var bal = BalanceOf(uid);
    if (bal <= 0) return Fail(400, "ফেরত দেওয়ার মতো টাকা নেই");
    using var c = Db.Open();
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
    if (c.ExecuteScalar<int>("SELECT COUNT(*) FROM dbo.users WHERE name = @n", new { n = name }) > 0)
        return Fail(400, "এই নামে একজন আছেন");
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
        if (c.ExecuteScalar<int>("SELECT COUNT(*) FROM dbo.users WHERE name = @n AND id <> @i",
                new { n = name, i = id }) > 0)
            return Fail(400, "এই নামে একজন আছেন");
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

app.MapDelete("/api/users/{id:int}", (HttpContext ctx, int id) =>
{
    var (me, err) = Auth(ctx, "admin"); if (err is not null) return err;
    if (id == me!.id) return Fail(400, "নিজেকে মোছা যাবে না");
    using var c = Db.Open();
    c.Execute("UPDATE dbo.users SET active = 0 WHERE id = @i", new { i = id });
    c.Execute("DELETE FROM dbo.sessions WHERE user_id = @i", new { i = id });
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
    List<OptionDto>? options);
record AvailReq(int? available);
record LineDto(int? item_id, int? option_id, int? qty, string? fallback_type, int? fallback_item_id,
    string? fallback_note);
record OrderReq(string? date, int? user_id, int? shop_id, string? note, List<LineDto>? lines);
record UsualReq(int? user_id, int? shop_id, List<LineDto>? lines);
record ShopReq(string? name, int? active, int? sort_order);
record ShopPriceDto(int? item_id, decimal? price, int? available);
record ShopPricesReq(List<ShopPriceDto>? prices);
record StatusReq(string? date, int? floor, string? status, string? message);
record OStatusReq(string? status);
record DeliverAllReq(string? date, int? floor);
record LedgerReq(int? user_id, string? type, decimal? amount, string? note);
record RefundAllReq(int? user_id, string? note);
record UserReq(string? name, string? pin, int? floor, string? role, string? password, int? active);
record SettingsReq(string? office_name, int? money_module, int? allow_register, string? floors);
