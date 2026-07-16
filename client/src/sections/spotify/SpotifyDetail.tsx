import {
  NowPlayingWidget,
  RecentlyPlayedWidget,
  TopAlbumsWidget,
  TopArtistsWidget,
  TopTracksWidget,
} from '../../widgets/SpotifyWidget';
import { DetailSectionHeading } from '../DetailIntro';
import './spotify.css';

export function SpotifyDetail() {
  return (
    <div>
      <DetailSectionHeading label="On now" title="What's playing" />
      <NowPlayingWidget />
      <DetailSectionHeading
        label="On repeat"
        title="Your rotation"
        detail="Toggle the top cards between 4 weeks, 6 months, 12 months, and all time — all-time counts and top albums build up the longer this dashboard keeps running."
      />
      <div className="space-y-4">
        <TopArtistsWidget />
        <TopAlbumsWidget />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TopTracksWidget />
          <RecentlyPlayedWidget />
        </div>
      </div>
    </div>
  );
}
