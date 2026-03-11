const REQUIRED_VARS = [
    'JWT_SECRET',
    'DATABASE_URL',
    'REDIS_URL',
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET_NAME',
    'R2_PUBLIC_URL',
] as const;

type EnvKey = typeof REQUIRED_VARS[number];

function validateEnv(): Record<EnvKey, string> {
    const missing: string[] = [];

    for (const key of REQUIRED_VARS) {
        if (!process.env[key]) {
            missing.push(key);
        }
    }

    if (missing.length > 0) {
        console.error('❌ Missing required environment variables:');
        missing.forEach(k => console.error(`   • ${k}`));
        console.error('\nAdd them to your .env file and restart.');
        process.exit(1);
    }

    console.log('✅ Environment validated');
    return Object.fromEntries(
        REQUIRED_VARS.map(k => [k, process.env[k]!])
    ) as Record<EnvKey, string>;
}

export const env = validateEnv();