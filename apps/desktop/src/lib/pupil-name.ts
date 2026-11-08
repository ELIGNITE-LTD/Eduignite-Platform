/**
 * Display name of a pupil. Basic-education pupils may have no login (Student.user is null),
 * so the name can live on `full_name` / `display_name` / `name` instead of `user.name`.
 */
export function pupilName(student: any, fallback = ""): string {
  if (!student) return fallback;
  return (
    student.full_name ||
    student.display_name ||
    student.user?.name ||
    student.name ||
    fallback
  );
}
