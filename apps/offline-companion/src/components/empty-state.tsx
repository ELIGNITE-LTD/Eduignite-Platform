import type { LucideIcon } from "lucide-react";
import { Card } from "./ui/card";

/**
 * The one "nothing here yet" treatment — icon, short title, one line of
 * supporting copy, optional action. Used for empty announcement feeds,
 * empty chat contact lists, empty surveys, etc, instead of ad hoc <p> tags.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="p-8 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-50">
        <Icon className="h-6 w-6 text-gray-300" />
      </div>
      <p className="mt-4 text-sm font-bold text-primary-dark">{title}</p>
      {description ? <p className="mt-1 text-sm text-gray-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </Card>
  );
}
