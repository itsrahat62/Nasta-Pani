# -*- coding: utf-8 -*-
"""
নাস্তা অর্ডার — ডেমো ডেটা বসায় (দেখানোর জন্য)

চালানোর আগে অ্যাপটা চালু থাকতে হবে:
    dotnet run
তারপর:
    python tools/demo-data.py [http://localhost:5000]

দুই তলার ৯ জন লোক, দুই হোটেলে আলাদা দাম, রোজকার অর্ডার, "না পেলে কী নেব",
হাতে দেওয়া টাকা আর দুজনের প্লেট সাজানো — সব বসিয়ে দেয়।

সাবধান: এটা শুধু খালি/টেস্ট ডেটাবেজে চালাবেন। আসল অফিসের ডেটাবেজে নয়।
"""
import json
import sys
import urllib.error
import urllib.request
import http.cookiejar

B = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5000").rstrip("/")

ADMIN = ("admin", "admin@123")
STAFF = ("4800", "1234@4321")


def client():
    cj = http.cookiejar.CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))


def call(op, path, method="GET", body=None):
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    req = urllib.request.Request(B + path, data=data, method=method,
                                 headers={"Content-Type": "application/json; charset=utf-8"})
    try:
        with op.open(req, timeout=20) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return {"__http": e.code, **json.loads(e.read().decode("utf-8"))}


def login(pin, pw):
    op = client()
    r = call(op, "/api/login", "POST", {"pin": pin, "password": pw})
    if not r.get("ok"):
        sys.exit("লগইন হলো না (%s) — পাসওয়ার্ড বদলে ফেলেছেন? %s" % (pin, r))
    return op


admin = login(*ADMIN)
staff = login(*STAFF)

# দুই তলাতেই অর্ডার নেওয়া চালু
call(staff, "/api/status", "PUT", {"status": "open", "message": "আজ পরোটা গরম গরম আসছে"})
call(admin, "/api/status", "PUT", {"floor": 3, "status": "open", "message": ""})

shops = call(staff, "/api/shops")
if len(shops) < 2:
    sys.exit("অন্তত দুটো দোকান দরকার (Hotel Star, Prince Hotel)")
STAR, PRINCE = shops[0]["id"], shops[1]["id"]

items = {i["name"]: i for i in call(staff, "/api/items")}


def iid(name):
    if name not in items:
        sys.exit("মেনুতে '%s' নেই — ডেমো ডেটা খালি ডেটাবেজে চালান" % name)
    return items[name]["id"]


def oid(name, option):
    return next((x["id"] for x in items[name]["options"] if x["name"] == option), None)


# ---- দোকানভেদে দাম (স্টাফ যেভাবে বসাবে) ----
call(staff, "/api/shops/%d/prices" % PRINCE, "PUT", {"prices": [
    {"item_id": iid("পরোটা"),           "price": 18},
    {"item_id": iid("সিঙ্গারা"),         "price": 12},
    {"item_id": iid("ডিম"),             "price": 28},
    {"item_id": iid("বুটের ডাল"),        "price": 25},
    {"item_id": iid("ডাল ভাজি মিক্সড"),  "price": 30},
    {"item_id": iid("চা"),              "price": 12},
    {"item_id": iid("মুগ ডাল"), "available": 0},    # প্রিন্সে মুগ ডাল নেই
]})
call(staff, "/api/shops/%d/prices" % STAR, "PUT", {"prices": [
    {"item_id": iid("সমুচা"), "available": 0},      # স্টারে সমুচা নেই
]})

# ---- অফিসের লোকজন: (নাম, PIN, তলা, দোকান, অর্ডার, হাতে দেওয়া টাকা, রোজকার কি না) ----
PEOPLE = [
    ("রাহাত ভাই",  "2101", 2, STAR,   [("পরোটা", "তেল দিয়ে", 2), ("ডিম", "ভাজি", 1), ("চা", "দুধ চা", 1)], 100, True),
    ("সুমন ভাই",   "2102", 2, STAR,   [("পরোটা", "তেল ছাড়া", 2), ("বুটের ডাল", None, 1)], 50, True),
    ("তানভীর",     "2103", 2, PRINCE, [("সিঙ্গারা", None, 3), ("চা", "রঙ চা", 1)], 0, False),
    ("মাহমুদ ভাই", "2104", 2, PRINCE, [("পরোটা", "তেল দিয়ে", 2), ("ডাল ভাজি মিক্সড", None, 1), ("ডিম", "পোচ", 1)], 200, True),
    ("রুবেল",      "2105", 2, STAR,   [("পুরি", None, 4), ("চা", "চিনি ছাড়া", 1)], 0, False),
    ("নাসরিন আপা", "2106", 2, STAR,   [("পরোটা", "তেল ছাড়া", 1), ("সবজি ভাজি", None, 1), ("চা", "দুধ চা", 1)], 500, True),
    ("ইমরান",      "2107", 2, PRINCE, [("ডিম", "ওমলেট", 2), ("পরোটা", "তেল দিয়ে", 2)], 100, False),
    ("করিম ভাই",   "3101", 3, STAR,   [("সিঙ্গারা", None, 2), ("চা", "দুধ চা", 1)], 50, False),
    ("শাকিল",      "3102", 3, PRINCE, [("পরোটা", "তেল দিয়ে", 3), ("বুটের ডাল", None, 1)], 0, False),
]

# "না পেলে কী নেব" — কয়েকজনের জন্য
FALLBACK = {
    "সুমন ভাই":   ("item", "সবজি ভাজি", "ভাজিও না থাকলে কিছু লাগবে না"),
    "মাহমুদ ভাই": ("anything", None, ""),
    "নাসরিন আপা": ("skip", None, "ঝাল একদম কম"),
}
WITH_FALLBACK = ("বুটের ডাল", "ডাল ভাজি মিক্সড", "সবজি ভাজি", "পরোটা")

for name, pin, floor, shop, lines, cash, usual in PEOPLE:
    u = client()
    r = call(u, "/api/register", "POST",
             {"name": name, "pin": pin, "floor": floor, "password": "1234"})
    if r.get("__http") == 400:
        call(u, "/api/login", "POST", {"pin": pin, "password": "1234"})
    me = call(u, "/api/bootstrap").get("user")
    if not me:
        print("  ! %s-কে বসানো গেল না (%s)" % (name, r.get("error")))
        continue

    payload = []
    for it, op, qty in lines:
        line = {"item_id": iid(it), "qty": qty}
        if op:
            line["option_id"] = oid(it, op)
        fb = FALLBACK.get(name)
        if fb and it in WITH_FALLBACK:
            line["fallback_type"] = fb[0]
            if fb[1]:
                line["fallback_item_id"] = iid(fb[1])
            if fb[2]:
                line["fallback_note"] = fb[2]
        payload.append(line)

    o = call(u, "/api/orders", "POST", {
        "shop_id": shop, "lines": payload,
        "note": "চা একটু কড়া" if name == "রাহাত ভাই" else "",
    })
    if usual:
        call(u, "/api/me/usual", "PUT", {"shop_id": shop, "lines": payload})
    if cash:
        call(staff if floor == 2 else admin, "/api/ledger", "POST",
             {"user_id": me["id"], "type": "deposit", "amount": cash,
              "note": "অর্ডারের সময় হাতে দিলেন"})

    print("  %-12s PIN %s  তলা %d  %-13s ৳%-6s %s" % (
        name, pin, floor, "Hotel Star" if shop == STAR else "Prince Hotel",
        o.get("total"), "⚡রোজকার" if usual else ""))

# দুজনের প্লেট আগেই সাজানো হয়ে গেছে — অগ্রগতি দেখানোর জন্য
for o in call(staff, "/api/orders")["orders"]:
    if o["user_name"] in ("রাহাত ভাই", "সুমন ভাই"):
        call(staff, "/api/orders/%d/status" % o["id"], "PATCH", {"status": "delivered"})

print("\n--- ২য় তলার বাজারের লিস্ট ---")
for sh in call(staff, "/api/summary")["shops"]:
    print(" 🏪 %s — %d টি · ৳%s" % (sh["shop_name"], sh["qty"], sh["amount"]))
    for g in sh["groups"]:
        opt = " (%s)" % g["option_name"] if g["option_name"] else ""
        print("     %2d × %s%s" % (g["qty"], g["item_name"], opt))

m = call(staff, "/api/money-today")
print("\nআজ হাতে এসেছে ৳%s | ফেরত দিতে হবে ৳%s | পাওনা ৳%s"
      % (m["collected_today"], m["to_return_total"], m["owed_total"]))
print("\n✅ ডেমো ডেটা বসানো শেষ — স্টাফ হিসেবে ঢুকুন: PIN 4800 / 1234@4321")
