const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const cors = require("cors");

admin.initializeApp(); // Firebase Admin 초기화

// CORS 미들웨어 적용
const corsOptions = {
  origin: true, // 모든 도메인 허용 (혹은 특정 도메인만 허용 가능)
};

// FCM 메시지 보내는 함수
const sendPushNotification = async (title, body, tokens) => {
  const message = {
    notification: {
      title,
      body,
    },
    tokens,
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(message);
    console.log("Messages sent successfully!", response);
    return { success: true, response };
  } catch (error) {
    console.error("Error sending messages:", error);
    return { success: false, error: error.message };
  }
};

// 요청에 대한 푸시 알림 함수
exports.sendPushNotifications = onRequest(async (req, res) => {
  cors(corsOptions)(req, res, async () => {
    const { tokens, title, body } = req.body;
    const response = await sendPushNotification(title, body, tokens);
    return res.status(response.success ? 200 : 500).json(response);
  });
});

// 날짜 비교 함수
const getFormattedDate = (date) => new Date(date).toLocaleDateString();

// 스케줄된 푸시 알림 함수
exports.scheduledPushNotifications = onSchedule(
  {
    schedule: "0 8 * * *", // 매일 오전 8시 (UTC 기준)
    timeZone: "Asia/Seoul", // 한국 표준시 기준
  },
  async (event) => {
    const db = admin.firestore();
    const marathonsRef = db.collection("marathons");
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1); // 내일 날짜
    const todayStr = getFormattedDate(today);
    const tomorrowStr = getFormattedDate(tomorrow);

    try {
      const marathonsSnapshot = await marathonsRef.get();

      for (const doc of marathonsSnapshot.docs) {
        const marathonData = doc.data();

        const registrationStartDateStr = getFormattedDate(marathonData.registrationPeriod.startDate);

        // 1. 대회 신청일 알림 (신청 시작일이 오늘 또는 내일인 경우)
        if (registrationStartDateStr === todayStr) {
          const { name, tokens } = marathonData;
          await sendPushNotification(name, "대회 신청일입니다!", tokens);
        }

        const eventDateStr = getFormattedDate(marathonData.date);

        // 2. 대회 전날 알림 (대회 시작일이 내일인 경우)
        if (eventDateStr === tomorrowStr) {
          const { name, tokens } = marathonData;
          await sendPushNotification("내일 대회가 있습니다! 준비하세요.", tokens, name);
        }
      }

      return { success: true };
    } catch (error) {
      console.error("Error sending notifications:", error);
      return { success: false, error: error.message };
    }
  }
);
