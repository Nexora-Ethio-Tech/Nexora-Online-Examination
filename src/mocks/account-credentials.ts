/** Demo parity only. Real IDs and passwords are allocated by the backend. */
export function demoStudentLogin(number: number, at: Date) {
  const year = new Intl.DateTimeFormat('en', {
    calendar: 'ethiopic',
    numberingSystem: 'latn',
    timeZone: 'Africa/Addis_Ababa',
    year: 'numeric',
  })
    .formatToParts(at)
    .find((p) => p.type === 'year')?.value;
  if (!year) throw new Error('Ethiopian calendar unavailable');
  return `STU/001/${String(number).padStart(4, '0')}/${year.slice(-2).padStart(2, '0')}`;
}
export function demoAccountPassword() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&*?';
  for (;;) {
    let password = '';
    while (password.length < 8) {
      const value = crypto.getRandomValues(new Uint8Array(1))[0];
      if (value !== undefined && value < 256 - (256 % alphabet.length))
        password += alphabet[value % alphabet.length];
    }
    if (
      /[A-Z]/.test(password) &&
      /[a-z]/.test(password) &&
      /[0-9]/.test(password) &&
      /[!#$%&*?]/.test(password)
    )
      return password;
  }
}
