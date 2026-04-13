// metro.config.js — Metro 번들러 설정
// expo-router가 require.context로 라우트를 자동 발견하기 위해 필요

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

module.exports = config;
