export type PasswordScore = 0 | 1 | 2 | 3 | 4;

/** Rough UX hint (not a security control — the schema + Better Auth enforce the policy). */
export function scorePassword(password: string): PasswordScore {
  const characters = [...password];
  const [firstCharacter] = characters;
  const repeatedCharacter =
    characters.length > 1 &&
    !/[\r\n\u2028\u2029]/u.test(password) &&
    characters.every((character) => character === firstCharacter);

  if (!password || repeatedCharacter) {
    return 0;
  }

  let points = 0;
  if (password.length >= 12) {
    points += 1;
  }
  if (password.length >= 16) {
    points += 1;
  }
  if (/[a-z]/u.test(password) && /[A-Z]/u.test(password)) {
    points += 1;
  }
  if (/\d/u.test(password)) {
    points += 1;
  }
  if (/[^A-Za-z0-9]/u.test(password)) {
    points += 1;
  }

  return Math.min(points, 4) as PasswordScore;
}
