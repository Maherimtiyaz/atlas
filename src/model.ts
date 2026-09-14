export type AppScreen =
  | 'landing'
  | 'analyzing'
  | 'map'
  | 'explorer'
  | 'inspector';

export interface Repository {
  id: string;
  name: string;
}
