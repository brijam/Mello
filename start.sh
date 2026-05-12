#!/bin/bash
npm install
cd server && npx drizzle-kit migrate && cd ..
npm run dev
