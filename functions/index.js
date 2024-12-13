const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const cors = require("cors");

admin.initializeApp(); // Firebase Admin 초기화

// CORS 미들웨어 적용

const allowlist = ['http://localhost:5173', 'https://dev-runal.netlify.app', 'https://runal.netlify.app'];

// CORS 옵션 동적 설정
const corsOptionsDelegate = function (req, callback) {
  let corsOptions;
  const origin = req.header('Origin');

  // CORS 요청을 허용할 도메인
  if (allowlist.indexOf(origin) !== -1) {
    corsOptions = { 
      origin: true, // 요청된 Origin을 CORS 응답에 반영
      methods: ['POST', 'OPTIONS'], // 허용할 HTTP 메서드
      allowedHeaders: ['Content-Type'], // 허용할 요청 헤더
    };
  } else {
    corsOptions = { origin: false }; // CORS 비활성화
  }
  
  // CORS 설정 적용
  callback(null, corsOptions);
};


// FCM 메시지 보내는 함수
const sendPushNotification = async (title, body, icon, tokens) => {

  const message = {
    data: {
      title,
      body,
      icon,
    },
    tokens
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
  cors(corsOptionsDelegate)(req, res, async () => {
    const { tokens, title, body, icon } = req.body;
    const response = await sendPushNotification(title, body, icon, tokens);
    return res.status(response.success ? 200 : 500).json(response);
  });
});

// 날짜 비교 함수
const getFormattedDate = (date) => new Date(date).toLocaleDateString();

// 스케줄된 푸시 알림 함수
exports.scheduledPushNotifications = onSchedule(
  {
    schedule: '0 8 * * *', // 매일 오전 9시 (KST 기준)
    timeZone: 'Asia/Seoul',
  },
  async () => {
    const db = admin.firestore();
    const marathonsRef = db.collection('marathons');

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const todayStr = getFormattedDate(today);
    const tomorrowStr = getFormattedDate(tomorrow);

    try {
      const marathonsSnapshot = await marathonsRef.get();

      for (const doc of marathonsSnapshot.docs) {
        const marathonId = doc.id;
        const marathonData = doc.data();

        console.log(`Processing marathon: ${marathonId}`);

        const registrationStartDateStr = getFormattedDate(
          marathonData.registrationPeriod.startDate
        );

        // 1. 대회 신청일 알림
        if (registrationStartDateStr === todayStr) {
          const tokens = await getSubscribers(marathonId);
          if (tokens.length > 0) {
            await sendPushNotification(
              marathonData.name,
              '대회 신청일입니다!',
              tokens
            );
          }
        }

        const eventDateStr = getFormattedDate(marathonData.date);

        // 2. 대회 전날 알림
        if (eventDateStr === tomorrowStr) {
          const tokens = await getSubscribers(marathonId);
          if (tokens.length > 0) {
            await sendPushNotification(
              marathonData.name,
              '내일 대회가 있습니다! 준비하세요.',
              tokens
            );
          }
        }
      }

      return { success: true };
    } catch (error) {
      console.error('Error sending notifications:', error);
      return { success: false, error: error.message };
    }
  }
);

const getSubscribers = async (marathonId) => {
  try {
    const db = admin.firestore();
    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('marathons', 'array-contains', marathonId).get();

    // 유효한 토큰만 추출하여 반환
    const tokens = snapshot.docs
      .map(doc => doc.data().token)
      .filter(Boolean);  // 유효한 토큰만 필터링

    return tokens;
  } catch (error) {
    console.error('Error getting subscribers:', error);
    throw new Error('Failed to retrieve subscribers');
  }
};