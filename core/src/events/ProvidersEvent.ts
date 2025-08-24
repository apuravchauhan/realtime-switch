import { Providers } from '../eventmanager/Providers';

export type ProvidersEvent = {
  src: Providers,
  payload: { [key: string]: any };
}