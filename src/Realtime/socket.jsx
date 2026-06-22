import io from "socket.io-client";
import { Realtime } from "../../url";
//import { ENDPOINT_V } from "../../url";
 const socket = io(Realtime,  {
  withCredentials: true,
  transports: ["websocket", "polling"], // explicit, helps fallbacks
});
 
//const socket = io(ENDPOINT);

export {socket}

