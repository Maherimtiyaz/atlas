import type { AppScreen } from './model';

export interface AppState {
  screen: AppScreen;
}

export const initialState: AppState = {
  screen: 'landing',
};
