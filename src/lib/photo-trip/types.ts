export interface GuidePlace {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  mapUrl: string;
}

export interface RestaurantMatch extends GuidePlace {
  menu?: { item: string; url: string };
}

export interface RestaurantReport {
  dish: string;
  restaurants: RestaurantMatch[];
}

export type TripStep =
  | { mode: "walk"; text: string; minutes: number }
  | { mode: "transit"; line: string; from: string; to: string; headsign?: string };

export interface GuideTrip {
  destination: GuidePlace;
  minutes: number;
  transfers: number;
  steps: TripStep[];
  mapUrl: string;
}

export interface PhotoPreview {
  reply: string;
  token?: string;
  destination?: GuidePlace;
  dish?: string;
}

export interface PhotoTripResult {
  trip?: GuideTrip;
  report?: RestaurantReport;
  reply?: string;
}
