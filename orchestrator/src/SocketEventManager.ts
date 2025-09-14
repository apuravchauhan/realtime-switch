import { EventManager, ProvidersEvent, Logger } from "@realtime-switch/core";
import * as uWS from 'uWebSockets.js';

const CLASS_NAME = 'SocketProcessor';

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
        Logger.error(CLASS_NAME, null, 'Error sending data to browser', error as Error);
      }
    } else {
      Logger.warn(CLASS_NAME, null, 'WebSocket is null/undefined');
    }
  }
}