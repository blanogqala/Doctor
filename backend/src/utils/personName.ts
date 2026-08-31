export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();
  if (!trimmed) {
    return { firstName: 'Unknown', lastName: 'Unknown' };
  }
  const space = trimmed.indexOf(' ');
  if (space === -1) {
    return { firstName: trimmed, lastName: trimmed };
  }
  const firstName = trimmed.slice(0, space).trim();
  const lastName = trimmed.slice(space + 1).trim();
  return {
    firstName: firstName || trimmed,
    lastName: lastName || firstName || trimmed,
  };
}

export function joinPersonName(firstName: string, lastName: string): string {
  const first = firstName.trim();
  const last = lastName.trim();
  if (first && last && first !== last) {
    return `${first} ${last}`;
  }
  return first || last || 'Unknown';
}
