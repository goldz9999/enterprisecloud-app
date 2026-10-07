import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Ruta accesible sin sesión (login, health). Todo lo demás exige token. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
