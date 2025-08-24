import { EventManager, ProvidersEvent } from "@realtime-switch/core";
import * as uWS from 'uWebSockets.js';

export default class SocketProcessor extends EventManager {
  private ws: any;

  constructor(ws: uWS.WebSocket<unknown>) {
    super();
    this.ws = ws;
  }

  receiveEvent(event: ProvidersEvent): void {
    if (this.ws) {
      try {
        const jsonString = JSON.stringify(event.payload);
        this.ws.send(jsonString, 0);
      } catch (error) {
        console.error('Error sending data to browser:', error);
      }
    } else {
      console.log('WebSocket is null/undefined');
    }
  }
}