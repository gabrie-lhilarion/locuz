module.exports = {
	PORT: process.env.PORT || 3000,
	MONGO_URL: process.env.MONGO_URL || "mongodb://localhost:27017/locuz-dev",
	PAGE_LIMIT: process.env.PAGE_LIMIT || 50,
	SECRET: process.env.SECRET || "l0cuz",
	FCM_SERVICE_ACC_KEY_PATH: require("path").join(__dirname, "./firebase.json"),
	ENABLE_SENTRY: !!process.env.ENABLE_SENTRY,
	INVALID_HANDLES: [
		"bot",
		"home",
		"page",
		"admin",
		"locuz",
		"legal",
		"terms",
		"privacy",
		"replies",
		"mentions",
		"vasanthv",
		"locuzapp",
		"administrator",
	],
};
