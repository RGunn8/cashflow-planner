import uuid from 'react-native-uuid';

export function newId(): string {
  return uuid.v4() as string;
}
