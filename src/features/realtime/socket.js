import io from "socket.io-client";
import { Realtime } from "../../shared/config/runtimeConfig";
//import { ENDPOINT_V } from "../../shared/config/runtimeConfig";
 const socket = io(Realtime,  {
  withCredentials: true,
  transports: ["websocket", "polling"], // explicit, helps fallbacks
});
 
//const socket = io(ENDPOINT);

export {socket}

