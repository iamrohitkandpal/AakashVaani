import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import * as serviceWorker from "./serviceWorker";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// If you want your app to work offline and load faster, you can change
// unregister() to register() below
serviceWorker.register({
  onSuccess: (registration) => {
    console.log('Service Worker registered successfully!');
    // You could show a toast message here
  },
  onUpdate: (registration) => {
    console.log('New content is available, please refresh.');
    // You could show a notification with a refresh button here
  }
});
