import { ProvidersEvent } from "../events/ProvidersEvent";

export abstract class EventManager {
  subscribers: EventManager[];

  constructor() {
    this.subscribers = [];
  }
  addSubscribers(...sub: EventManager[]): void {
    this.subscribers.push(...sub);
  }
  emitEvent(event: ProvidersEvent): void {
    this.subscribers.forEach(sub => sub.receiveEvent(event));
  }
  abstract receiveEvent(event: ProvidersEvent): void
  cleanup() {
    this.subscribers = [];
  }
}