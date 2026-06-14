/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    outputFileTracingIncludes: {
      // transcript API が yt-dlp バイナリを必要とする
      "/api/transcript": ["./bin/yt-dlp"],
    },
  },
};

export default nextConfig;
