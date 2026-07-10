import {
  ContributionsWidget,
  GitHubActivityWidget,
  GitHubWorkWidget,
  RepoHealthWidget,
} from '../../widgets/GitHubWidgets';

export function GitHubDetail() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <GitHubActivityWidget />
      <GitHubWorkWidget />
      <div className="sm:col-span-2">
        <ContributionsWidget />
      </div>
      <div className="sm:col-span-2">
        <RepoHealthWidget />
      </div>
    </div>
  );
}
