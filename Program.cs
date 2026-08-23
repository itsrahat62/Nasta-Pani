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
        @"SELECT u.id, u.name, u.role, u.active
            FROM dbo.sessions s JOIN dbo.users u ON u.id = s.user_id
           WHERE s.token = @t", new { t = token });
    if (r is null || !(bool)r.active) return null;
    return new Me((int)r.id, (string)r.name, (string)r.role);
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
var DAY_STATUS = new Dictionary<string, object>
{
    ["open"]    = new { label = "অর্ডার নেওয়া হচ্ছে",      icon = "🟢", tone = "ok",   canOrder = true },
    ["closed"]  = new { label = "অর্ডার নেওয়া বন্ধ",        icon = "🔴", tone = "warn", canOrder = false },
    ["buying"]  = new { label = "বাজারে যাওয়া হয়েছে",      icon = "🛵", tone = "info", canOrder = false },
    ["arrived"] = new { label = "নাস্তা চলে এসেছে",         icon = "📦", tone = "info", canOrder = false },
    ["served"]  = new { label = "নাস্তা পরিবেশন করা হয়েছে", icon = "✅", tone = "ok",   canOrder = false },
    ["off"]     = new { label = "আজ নাস্তা নেই",            icon = "🚫", tone = "warn", canOrder = false },
};
var STATUS_META = DAY_STATUS.ToDictionary(
    kv => kv.Key,
    kv => JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(JsonSerializer.Serialize(kv.Value))!);

Dictionary<string, object?>? DayStatus(string date)
{
    using var c = Db.Open();
    var row = c.QueryFirstOrDefault("SELECT * FROM dbo.day_status WHERE day = @d", new { d = date });
    if (row is null) return null;
    var d = D(row);
    var key = (string)d["status"]!;
    var meta = STATUS_META.TryGetValue(key, out var m) ? m : STATUS_META["open"];
    d["key"] = key;
    d["label"] = meta["label"].GetString();
    d["icon"] = meta["icon"].GetString();
    d["tone"] = meta["tone"].GetString();
    d["canOrder"] = meta["canOrder"].GetBoolean();
    return d;
}
/// <summary>ইউজার এখন অর্ডার বদলাতে পারবে কি না।</summary>
bool OrderLocked(dynamic? order, Me me, string date)
{
    if (me.role != "user") return false;
    if (order is not null && (string)order.status != "pending") return true;
    var st = DayStatus(date);
    if (st is not null) return !(bool)st["canOrder"]!;
    return string.CompareOrdinal(Db.NowTime(), Db.GetSettings()["cutoff_time"]) >= 0;
}
string LockReason(string date)
{
    var st = DayStatus(date);
    if (st is not null && !(bool)st["canOrder"]!)
        return $"{st["icon"]} {st["label"]} — এখন আর অর্ডার বদলানো যাবে না";
    return $"অর্ডারের সময় শেষ ({Db.GetSettings()["cutoff_time"]}) — স্টাফকে বলুন";
}

// ------------------------------------------------------------- আইটেম লোড
List<Dictionary<string, object?>> LoadItems(bool onlyActive)
{
    using var c = Db.Open();
    var items = DL(c.Query(
        $"SELECT * FROM dbo.items {(onlyActive ? "WHERE active = 1" : "")} ORDER BY sort_order, id"));
    var opts = DL(c.Query("SELECT * FROM dbo.item_options ORDER BY sort_order, id"));
    foreach (var it in items)
        it["options"] = opts.Where(o => (int)o["item_id"]! == (int)it["id"]!).ToList();
    return items;
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
        cutoff_time = s["cutoff_time"],
        money_module = s["money_module"] == "1",
        today = d,
        now = Db.NowTime(),
        status = DayStatus(d),
        status_options = DAY_STATUS,
        user = me is null ? null : new { me.id, me.name, me.role },
    });
});

app.MapPost("/api/register", (HttpContext ctx, RegisterReq b) =>
{
    var name = (b.name ?? "").Trim();
    var pin = (b.pin ?? "").Trim();
    var pass = b.password ?? "";
    var s = Db.GetSettings();

    if (name.Length < 2) return Fail(400, "নাম কমপক্ষে ২ অক্ষর হতে হবে");
    if (pass.Length < 4) return Fail(400, "পাসওয়ার্ড কমপক্ষে ৪ অক্ষর হতে হবে");
    if (pin != s["register_pin"]) return Fail(400, "অফিস PIN ঠিক নয়");

    using var c = Db.Open();
    if (c.ExecuteScalar<int>("SELECT COUNT(*) FROM dbo.users WHERE name = @n", new { n = name }) > 0)
        return Fail(400, "এই নামে একজন আছেন — অন্য নাম দিন");

    var id = c.ExecuteScalar<int>(
        @"INSERT INTO dbo.users(name, password_hash, role, created_at)
          VALUES(@n, @p, 'user', @t); SELECT CAST(SCOPE_IDENTITY() AS INT);",
        new { n = name, p = BCrypt.Net.BCrypt.HashPassword(pass), t = Db.Stamp() });
    StartSession(ctx, id);
    return Results.Json(new { ok = true });
});

app.MapPost("/api/login", (HttpContext ctx, LoginReq b) =>
{
    using var c = Db.Open();
    var u = c.QueryFirstOrDefault("SELECT * FROM dbo.users WHERE name = @n", new { n = (b.name ?? "").Trim() });
    if (u is null || !BCrypt.Net.BCrypt.Verify(b.password ?? "", (string)u.password_hash))
        return Fail(400, "নাম বা পাসওয়ার্ড ভুল");
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
app.MapGet("/api/status", (HttpContext ctx, string? date) =>
{
    var (_, err) = Auth(ctx); if (err is not null) return err;
    var d = IsDate(date) ? date! : Db.Today();
    return Results.Json(new { date = d, now = Db.NowTime(), status = DayStatus(d) });
});

app.MapPut("/api/status", (HttpContext ctx, StatusReq b) =>
{
    var (me, err) = Auth(ctx, "staff"); if (err is not null) return err;
    var date = IsDate(b.date) ? b.date! : Db.Today();
    var status = b.status ?? "";
    if (!DAY_STATUS.ContainsKey(status)) return Fail(400, "ভুল অবস্থা");
    var msg = (b.message ?? "").Trim();
    if (msg.Length > 200) msg = msg[..200];

    using var c = Db.Open();
    c.Execute(
        @"UPDATE dbo.day_status
             SET status = @s, message = @m, updated_by = @u, updated_at = @t, version = version + 1
           WHERE day = @d;
          IF @@ROWCOUNT = 0
          INSERT INTO dbo.day_status(day, status, message, updated_by, updated_at, version)
          VALUES(@d, @s, @m, @u, @t, 1);",
        new { d = date, s = status, m = msg, u = me!.id, t = Db.Stamp() });
    return Results.Json(new { ok = true, status = DayStatus(date) });
});

// =============================================================== আইটেম
app.MapGet("/api/items", (HttpContext ctx, string? all) =>
{
    var (me, err) = Auth(ctx); if (err is not null) return err;
    var wantsAll = me!.role != "user" && all == "1";
    return Results.Json(LoadItems(onlyActive: !wantsAll));
});

void SaveOptions(int itemId, List<OptionDto>? options)
{
    if (options is null) return;
    using var c = Db.Open();
    c.Execute("DELETE FROM dbo.item_options WHERE item_id = @i", new { i = itemId });
    var clean = options.Where(o => !string.IsNullOrWhiteSpace(o.name)).ToList();
    for (int i = 0; i < clean.Count; i++)
        c.Execute("INSERT INTO dbo.item_options(item_id, name, price_delta, sort_order) VALUES(@i, @n, @d, @s)",
            new { i = itemId, n = clean[i].name!.Trim(), d = M(clean[i].price_delta ?? 0), s = (i + 1) * 10 });
}

app.MapPost("/api/items", (HttpContext ctx, ItemReq b) =>
{
    var (_, err) = Auth(ctx, "admin"); if (err is not null) return err;
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
    var (_, err) = Auth(ctx, "admin"); if (err is not null) return err;
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
    var (_, err) = Auth(ctx, "admin"); if (err is not null) return err;
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

app.MapGet("/api/orders/my", (HttpContext ctx, string? date) =>
{
    var (me, err) = Auth(ctx); if (err is not null) return err;
    var d = IsDate(date) ? date! : Db.Today();
    using var c = Db.Open();
    var o = c.QueryFirstOrDefault("SELECT * FROM dbo.orders WHERE user_id = @u AND order_date = @d",
        new { u = me!.id, d });
    return Results.Json(new
    {
        date = d,
        cutoff_time = Db.GetSettings()["cutoff_time"],
        now = Db.NowTime(),
        status = DayStatus(d),
        locked = OrderLocked(o, me, d),
        lock_reason = LockReason(d),
        order = Hydrate(o),
    });
});

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
    var existing = c.QueryFirstOrDefault("SELECT * FROM dbo.orders WHERE user_id = @u AND order_date = @d",
        new { u = targetUserId, d = date });
    if (OrderLocked(existing, me, date)) return Fail(400, LockReason(date));

    var items = LoadItems(onlyActive: false).ToDictionary(i => (int)i["id"]!);
    var prepared = new List<Dictionary<string, object?>>();

    foreach (var l in b.lines ?? new List<LineDto>())
    {
        if (!items.TryGetValue(l.item_id ?? 0, out var item)) continue;
        var qty = Math.Clamp(l.qty ?? 0, 0, 99);
        if (qty == 0) continue;

        var opts = (List<Dictionary<string, object?>>)item["options"]!;
        var opt = opts.FirstOrDefault(o => (int)o["id"]! == (l.option_id ?? 0));
        var unit = M((decimal)item["price"]! + (opt is null ? 0m : (decimal)opt["price_delta"]!));

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
        c.Execute("UPDATE dbo.orders SET note=@n, total=@t, updated_at=@u WHERE id=@i",
            new { n = note, t = total, u = Db.Stamp(), i = orderId });
        c.Execute("DELETE FROM dbo.order_lines WHERE order_id = @o", new { o = orderId });
    }
    else
    {
        orderId = c.ExecuteScalar<int>(
            @"INSERT INTO dbo.orders(user_id, order_date, note, total, created_at, updated_at)
              VALUES(@u, @d, @n, @t, @c, @c); SELECT CAST(SCOPE_IDENTITY() AS INT);",
            new { u = targetUserId, d = date, n = note, t = total, c = Db.Stamp() });
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

    return Results.Json(new { ok = true, id = orderId, total });
});

app.MapGet("/api/orders", (HttpContext ctx, string? date) =>
{
    var (_, err) = Auth(ctx, "staff"); if (err is not null) return err;
    var d = IsDate(date) ? date! : Db.Today();
    using var c = Db.Open();
    var rows = c.Query(
        @"SELECT o.*, u.name AS user_name FROM dbo.orders o
            JOIN dbo.users u ON u.id = o.user_id
           WHERE o.order_date = @d ORDER BY u.name", new { d });
    return Results.Json(new { date = d, orders = rows.Select(r => Hydrate(r)).ToList() });
});

app.MapPatch("/api/orders/{id:int}/status", (HttpContext ctx, int id, OStatusReq b) =>
{
    var (_, err) = Auth(ctx, "staff"); if (err is not null) return err;
    var st = b.status ?? "";
    if (st is not ("pending" or "purchased" or "delivered" or "cancelled")) return Fail(400, "ভুল স্ট্যাটাস");
    using var c = Db.Open();
    c.Execute("UPDATE dbo.orders SET status=@s, updated_at=@u WHERE id=@i",
        new { s = st, u = Db.Stamp(), i = id });
    SyncCharge(id);
    return Results.Json(new { ok = true });
});

app.MapPost("/api/orders/deliver-all", (HttpContext ctx, DeliverAllReq b) =>
{
    var (_, err) = Auth(ctx, "staff"); if (err is not null) return err;
    var date = IsDate(b.date) ? b.date! : Db.Today();
    using var c = Db.Open();
    var ids = c.Query<int>("SELECT id FROM dbo.orders WHERE order_date = @d AND status <> 'cancelled'",
        new { d = date }).ToList();
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
        if (OrderLocked(o, me, (string)o.order_date)) return Fail(400, LockReason((string)o.order_date));
    }
    c.Execute("DELETE FROM dbo.ledger WHERE ref_order_id = @o", new { o = id });
    c.Execute("DELETE FROM dbo.order_lines WHERE order_id = @o", new { o = id });
    c.Execute("DELETE FROM dbo.orders WHERE id = @i", new { i = id });
    return Results.Json(new { ok = true });
});

// =============================================== বাজারের লিস্ট (popup)
app.MapGet("/api/summary", (HttpContext ctx, string? date) =>
{
    var (_, err) = Auth(ctx, "staff"); if (err is not null) return err;
    var d = IsDate(date) ? date! : Db.Today();
    using var c = Db.Open();
    var rows = DL(c.Query(
        @"SELECT ol.*, u.name AS user_name, o.status
            FROM dbo.order_lines ol
            JOIN dbo.orders o ON o.id = ol.order_id
            JOIN dbo.users  u ON u.id = o.user_id
           WHERE o.order_date = @d AND o.status <> 'cancelled'", new { d }));

    var map = new Dictionary<string, Dictionary<string, object?>>();
    foreach (var r in rows)
    {
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

    var groups = map.Values
        .OrderBy(g => (string)g["item_name"]!, bnCompare)
        .ThenBy(g => (string)g["option_name"]!, bnCompare)
        .ToList();

    var people = c.ExecuteScalar<int>(
        "SELECT COUNT(*) FROM dbo.orders WHERE order_date = @d AND status <> 'cancelled'", new { d });

    return Results.Json(new
    {
        date = d,
        people,
        total_qty = groups.Sum(g => (int)g["qty"]!),
        total_amount = M(groups.Sum(g => (decimal)g["amount"]!)),
        groups,
    });
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

app.MapGet("/api/ledger/balances", (HttpContext ctx) =>
{
    var (_, err) = Auth(ctx, "staff"); if (err is not null) return err;
    using var c = Db.Open();
    var rows = DL(c.Query(
        @"SELECT u.id, u.name, u.role,
                 ISNULL(SUM(CASE WHEN l.type='deposit' THEN l.amount END), 0) AS deposit,
                 ISNULL(SUM(CASE WHEN l.type='charge'  THEN l.amount END), 0) AS charge,
                 ISNULL(SUM(CASE WHEN l.type='refund'  THEN l.amount END), 0) AS refund,
                 ISNULL(SUM(CASE WHEN l.type='adjust'  THEN l.amount END), 0) AS adjust
            FROM dbo.users u LEFT JOIN dbo.ledger l ON l.user_id = u.id
           WHERE u.active = 1
           GROUP BY u.id, u.name, u.role
           ORDER BY u.name"));
    foreach (var r in rows)
        r["balance"] = M((decimal)r["deposit"]! + (decimal)r["adjust"]! - (decimal)r["charge"]! - (decimal)r["refund"]!);
    return Results.Json(rows);
});

app.MapGet("/api/ledger/user/{id:int}", (HttpContext ctx, int id) =>
{
    var (_, err) = Auth(ctx, "staff"); if (err is not null) return err;
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
app.MapGet("/api/report", (HttpContext ctx, string? from, string? to) =>
{
    var (_, err) = Auth(ctx, "staff"); if (err is not null) return err;
    var f = IsDate(from) ? from! : Db.Today();
    var t = IsDate(to) ? to! : Db.Today();
    using var c = Db.Open();

    var days = DL(c.Query(
        @"SELECT order_date, COUNT(*) AS people, ISNULL(SUM(total), 0) AS amount
            FROM dbo.orders WHERE order_date BETWEEN @f AND @t AND status <> 'cancelled'
           GROUP BY order_date ORDER BY order_date DESC", new { f, t }));

    var byItem = DL(c.Query(
        @"SELECT ol.item_name, ol.option_name, SUM(ol.qty) AS qty, SUM(ol.subtotal) AS amount
            FROM dbo.order_lines ol JOIN dbo.orders o ON o.id = ol.order_id
           WHERE o.order_date BETWEEN @f AND @t AND o.status <> 'cancelled'
           GROUP BY ol.item_name, ol.option_name ORDER BY SUM(ol.qty) DESC", new { f, t }));

    var byUser = DL(c.Query(
        @"SELECT u.id, u.name, COUNT(o.id) AS days, ISNULL(SUM(o.total), 0) AS amount
            FROM dbo.orders o JOIN dbo.users u ON u.id = o.user_id
           WHERE o.order_date BETWEEN @f AND @t AND o.status <> 'cancelled'
           GROUP BY u.id, u.name ORDER BY SUM(o.total) DESC", new { f, t }));

    return Results.Json(new
    {
        from = f,
        to = t,
        total_amount = M(days.Sum(d => (decimal)d["amount"]!)),
        total_days = days.Count,
        days,
        byItem,
        byUser,
    });
});

// =============================================================== ইউজার
app.MapGet("/api/users", (HttpContext ctx) =>
{
    var (_, err) = Auth(ctx, "staff"); if (err is not null) return err;
    using var c = Db.Open();
    return Results.Json(DL(c.Query(
        "SELECT id, name, role, active, created_at FROM dbo.users ORDER BY role, name")));
});

app.MapPost("/api/users", (HttpContext ctx, UserReq b) =>
{
    var (_, err) = Auth(ctx, "admin"); if (err is not null) return err;
    var name = (b.name ?? "").Trim();
    var pass = b.password ?? "";
    var role = b.role is "user" or "staff" or "super_admin" ? b.role! : "user";
    if (name.Length < 2) return Fail(400, "নাম দিন");
    if (pass.Length < 4) return Fail(400, "পাসওয়ার্ড কমপক্ষে ৪ অক্ষর");
    using var c = Db.Open();
    if (c.ExecuteScalar<int>("SELECT COUNT(*) FROM dbo.users WHERE name = @n", new { n = name }) > 0)
        return Fail(400, "এই নামে একজন আছেন");
    var id = c.ExecuteScalar<int>(
        @"INSERT INTO dbo.users(name, password_hash, role, created_at)
          VALUES(@n, @p, @r, @t); SELECT CAST(SCOPE_IDENTITY() AS INT);",
        new { n = name, p = BCrypt.Net.BCrypt.HashPassword(pass), r = role, t = Db.Stamp() });
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
    if (b.role is "user" or "staff" or "super_admin")
    {
        if ((string)u.role == "super_admin" && b.role != "super_admin" &&
            c.ExecuteScalar<int>("SELECT COUNT(*) FROM dbo.users WHERE role='super_admin' AND active=1") <= 1)
            return Fail(400, "অন্তত একজন সুপার অ্যাডমিন থাকতে হবে");
        c.Execute("UPDATE dbo.users SET role = @r WHERE id = @i", new { r = b.role, i = id });
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
    if (b.register_pin is not null) patch["register_pin"] = b.register_pin.Trim();
    if (b.cutoff_time is not null) patch["cutoff_time"] = b.cutoff_time.Trim();
    if (b.money_module.HasValue) patch["money_module"] = b.money_module.Value != 0 ? "1" : "0";
    Db.SaveSettings(patch);
    return Results.Json(new { ok = true, settings = Db.GetSettings() });
});

// =============================================================== SPA
app.MapFallbackToFile("index.html");

app.Run();

// --------------------------------------------------------- মডেল
record Me(int id, string name, string role);

// --------------------------------------------------------- রিকোয়েস্ট মডেল
record RegisterReq(string? name, string? pin, string? password);
record LoginReq(string? name, string? password);
record PwdReq(string? old_password, string? new_password);
record OptionDto(string? name, decimal? price_delta);
record ItemReq(string? name, decimal? price, string? category, int? sort_order, int? active, int? available,
    List<OptionDto>? options);
record AvailReq(int? available);
record LineDto(int? item_id, int? option_id, int? qty, string? fallback_type, int? fallback_item_id,
    string? fallback_note);
record OrderReq(string? date, int? user_id, string? note, List<LineDto>? lines);
record StatusReq(string? date, string? status, string? message);
record OStatusReq(string? status);
record DeliverAllReq(string? date);
record LedgerReq(int? user_id, string? type, decimal? amount, string? note);
record RefundAllReq(int? user_id, string? note);
record UserReq(string? name, string? role, string? password, int? active);
record SettingsReq(string? office_name, string? register_pin, string? cutoff_time, int? money_module);
