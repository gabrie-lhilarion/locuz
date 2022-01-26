const fs = require("fs");
const path = require("path");
if (process.env.NODE_ENV) {
	console.log("Setting up service worker version...");
	const serviceWorkerContents = fs.readFileSync(path.join(__dirname, "www/sw.js")).toString();
	const VERSION = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"))).version;

	const newServiceWorkerContents = serviceWorkerContents.replace("~VERSION", VERSION);

	fs.writeFileSync(path.join(__dirname, "www/sw.js"), newServiceWorkerContents);
}
