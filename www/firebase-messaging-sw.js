/* global importScripts, firebase */
importScripts("https://www.gstatic.com/firebasejs/9.4.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.4.0/firebase-messaging-compat.js");
const firebaseConfig = {
	apiKey: "AIzaSyAbrOb7azsr-paOrtJacKkjfkwxSvNDdTo",
	authDomain: "locuzapp.firebaseapp.com",
	projectId: "locuzapp",
	storageBucket: "locuzapp.appspot.com",
	messagingSenderId: "68348347529",
	appId: "1:68348347529:web:bb8bcf157c6e80c5103258",
};
firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

self.addEventListener("notificationclick", function(event) {
	event.notification.close();
	const urlToOpen = new URL("/", self.location.origin).href;
	event.waitUntil(
		self.clients.matchAll({ includeUncontrolled: true, type: "window" }).then(function(windowClients) {
			const matchingClient = windowClients.find((windowClient) => windowClient.url === urlToOpen);
			return matchingClient ? matchingClient.focus() : self.clients.openWindow(urlToOpen);
		})
	);
});

messaging.onBackgroundMessage(function(payload) {
	const notificationOptions = { body: payload.data.body, icon: "/icon.png" };
	self.clients.matchAll({ includeUncontrolled: true, type: "window" }).then(function(clients) {
		clients.forEach(function(client) {
			client.postMessage(payload.data);
		});
	});
	return self.registration.showNotification(payload.data.title, notificationOptions);
});
