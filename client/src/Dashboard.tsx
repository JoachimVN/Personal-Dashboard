import { SystemWidget } from './widgets/SystemWidget';

export function Dashboard() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <SystemWidget />
    </div>
  );
}
