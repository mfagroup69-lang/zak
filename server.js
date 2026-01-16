import express from "express";
import cors from "cors";
import fs from "fs";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(cors());
app.use(express.json());

/* 🔑 Supabase (للاشتراكات فقط) */
const SUPABASE_URL = "https://daphkrmnykvyjzipcbxi.supabase.co";
const SUPABASE_KEY = "sb_publishable_jole5YmPw_aaruL_NZhJBQ_a7D9I6S3";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/* 🔑 VAPID */
const VAPID_PUBLIC_KEY = "BPj2AErv7oLYlwJfEdU1m6hpENzKErzWHkJkPvV9S2PmV8FBQdTNlyy0SrgQ-6BiChZyJht4x2ftFa8aoGo4DLQ";
const VAPID_PRIVATE_KEY = "vN8IiM1ufU33P9xqBerEwt8GH994aNPRwIo2CW4c0d8";

webpush.setVapidDetails(
  "mailto:admin@fma-group.com",
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

/* 📦 ملف المهام فقط */
const TASK_FILE = "./tasks.json";
if (!fs.existsSync(TASK_FILE)) {
  fs.writeFileSync(TASK_FILE, JSON.stringify([]));
}

/* 🟢 تسجيل الاشتراك (Supabase) */
app.post("/subscribe", async (req, res) => {
  const sub = req.body;

  const { error } = await supabase
    .from("subscriptions")
    .upsert(
      {
        endpoint: sub.endpoint,
        keys: sub.keys
      },
      { onConflict: "endpoint" }
    );

  if (error) {
    return res.status(500).json({ success: false });
  }

  const { count } = await supabase
    .from("subscriptions")
    .select("*", { count: "exact", head: true });

  res.json({ success: true, total: count });
});

/* 🔔 إرسال مهمة جديدة + إشعار */
app.post("/send-task", async (req, res) => {
  const { name, description, icon, image, link } = req.body;
  const id = Math.random().toString(36).substr(2, 9);

  const task = { id, name, description, icon, image, link };

  /* حفظ المهمة في ملف */
  const tasks = JSON.parse(fs.readFileSync(TASK_FILE, "utf-8"));
  tasks.push(task);
  fs.writeFileSync(TASK_FILE, JSON.stringify(tasks, null, 2));

  /* جلب المشتركين من Supabase */
  const { data: subs } = await supabase
    .from("subscriptions")
    .select("*");

  const payload = JSON.stringify({
    title: "مهمة جديدة: " + name,
    body: description || "لديك مهمة جديدة",
    icon: icon || "logo.png",
    image: image || "",
    link: link || "https://fmagroup.com"
  });

  /* إرسال الإشعارات */
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: s.keys },
        payload
      );
    } catch (err) {
      if (err.statusCode === 410) {
        await supabase
          .from("subscriptions")
          .delete()
          .eq("endpoint", s.endpoint);
      }
    }
  }

  res.json({ success: true, task });
});

/* 📥 استرجاع المهام (للصفحة) */
app.get("/tasks", (req, res) => {
  const tasks = JSON.parse(fs.readFileSync(TASK_FILE, "utf-8"));
  res.json(tasks);
});

/* اختبار */
app.get("/", (req, res) => {
  res.send("✅ Push (Supabase) + Tasks (Files) Server running");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 Server running on port " + PORT);
});
