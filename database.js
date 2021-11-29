/**
 * A singleton implemetaion for the database
 */

const mongoose = require("mongoose");
const config = require("./config");

module.exports = (() => {
	let instance;
	let db = mongoose.connection;

	const connectToDb = () => {
		mongoose.connect(config.MONGO_URL, {
			useCreateIndex: true,
			useNewUrlParser: true,
			useUnifiedTopology: true,
		});
	};

	const createInstance = () => {
		db.on("error", (error) => {
			console.error("Error in MongoDb connection: " + error);
			mongoose.disconnect(); // Trigger disconnect on any error
		});
		db.on("connected", () => console.log("Data Db connected"));
		db.on("disconnected", () => {
			console.log("MongoDB disconnected!");
			connectToDb();
		});

		connectToDb();
		const Schema = mongoose.Schema;

		console.log("Db initialized");

		const userSchema = new Schema({
			handle: { type: String, index: true, required: true },
			password: String,
			token: { type: String, index: true },
			deviceToken: String,
			email: { type: String, index: true },
			color: String,
			location: { type: [Number], index: "2dsphere" },
			blocked: [{ type: Schema.Types.ObjectId, ref: "Users" }],
			joinedOn: { type: Date, default: Date.now },
			lastLogin: Date,
			lastSeenOn: Date,
		});

		const postSchema = new Schema({
			from: { type: Schema.Types.ObjectId, ref: "Users", index: true },
			text: { type: String, text: true },
			date: { type: Date, default: Date.now },
			location: { type: [Number], index: "2dsphere" },
			mentions: { type: [{ type: Schema.Types.ObjectId, ref: "Users" }], index: true },
			conversationId: { type: String, index: true },
		});

		const Users = mongoose.model("Users", userSchema);
		const Posts = mongoose.model("Posts", postSchema);

		// Users.syncIndexes()
		// 	.then(() => Users.ensureIndexes())
		// 	.then(() => Users.collection.getIndexes())
		// 	.then(console.log);

		return { Users, Posts };
	};
	return {
		getInstance: () => {
			if (!instance) {
				instance = createInstance();
			}
			return instance;
		},
		connection: db, // used for express ession
	};
})();
