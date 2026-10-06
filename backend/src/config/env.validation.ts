type Environment = Record<string, string | undefined>;

export function validateEnvironment(environment: Environment): Environment & {
  NODE_ENV: string;
  PORT: string;
  CORS_ORIGIN: string;
  DATABASE_URL: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
} {
  const errors: string[] = [];
  const nodeEnv = environment.NODE_ENV ?? 'development';
  const port = environment.PORT ?? '3000';
  const corsOrigin = environment.CORS_ORIGIN ?? 'http://localhost:5173';
  const jwtSecret = environment.JWT_SECRET;
  const jwtExpiresIn = environment.JWT_EXPIRES_IN ?? '8h';

  if (!['development', 'production', 'test'].includes(nodeEnv)) {
    errors.push('NODE_ENV must be development, production, or test');
  }

  const numericPort = Number(port);
  if (!Number.isInteger(numericPort) || numericPort < 1 || numericPort > 65535) {
    errors.push('PORT must be an integer between 1 and 65535');
  }

  const databaseUrl = environment.DATABASE_URL;
  if (!databaseUrl) {
    errors.push('DATABASE_URL is required');
  } else {
    try {
      const url = new URL(databaseUrl);
      if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
        errors.push('DATABASE_URL must use the PostgreSQL protocol');
      }
    } catch {
      errors.push('DATABASE_URL must be a valid URL');
    }
  }

  if (!corsOrigin.split(',').every((origin) => origin.trim().length > 0)) {
    errors.push('CORS_ORIGIN must contain one or more comma-separated origins');
  }

  if (!jwtSecret || jwtSecret.trim().length < 32) {
    errors.push('JWT_SECRET is required and must be at least 32 characters long');
  }

  if (!/^[1-9]\d*[smhd]$/.test(jwtExpiresIn)) {
    errors.push('JWT_EXPIRES_IN must be a positive duration such as 15m, 8h, or 7d');
  }

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n- ${errors.join('\n- ')}`);
  }

  return {
    ...environment,
    NODE_ENV: nodeEnv,
    PORT: port,
    CORS_ORIGIN: corsOrigin,
    DATABASE_URL: environment.DATABASE_URL!,
    JWT_SECRET: jwtSecret!,
    JWT_EXPIRES_IN: jwtExpiresIn,
  };
}