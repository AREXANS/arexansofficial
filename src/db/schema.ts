import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Firebase Auth Users Table
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// App Settings
export const appSettings = pgTable('app_settings', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
  description: text('description'),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});

// Packages
export const packages = pgTable('packages', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  display_name: text('display_name').notNull(),
  price_per_day: integer('price_per_day').notNull(),
  description: text('description'),
  features: jsonb('features'),
  is_active: boolean('is_active').default(true),
  sort_order: integer('sort_order').default(0),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});

// Transactions
export const transactions = pgTable('transactions', {
  id: text('id').primaryKey(),
  transaction_id: text('transaction_id').notNull().unique(),
  customer_name: text('customer_name').notNull(),
  customer_whatsapp: text('customer_whatsapp'),
  package_name: text('package_name').notNull(),
  package_duration: integer('package_duration').notNull(),
  original_amount: integer('original_amount').notNull(),
  total_amount: integer('total_amount').notNull(),
  status: text('status').notNull().default('pending'),
  license_key: text('license_key'),
  qr_string: text('qr_string'),
  device_id: text('device_id'),
  ip_address: text('ip_address'),
  expires_at: timestamp('expires_at'),
  paid_at: timestamp('paid_at'),
  created_at: timestamp('created_at').defaultNow(),
});

// Admin Sessions
export const adminSessions = pgTable('admin_sessions', {
  id: text('id').primaryKey(),
  device_id: text('device_id').notNull(),
  device_name: text('device_name'),
  device_info: jsonb('device_info'),
  login_time: timestamp('login_time').defaultNow(),
  is_current: boolean('is_current').default(true),
  is_approved: boolean('is_approved').default(false),
});

// Ads
export const ads = pgTable('ads', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  media_url: text('media_url').notNull(),
  media_type: text('media_type').notNull().default('image'),
  link: text('link'),
  link_url: text('link_url'),
  sort_order: integer('sort_order').default(0),
  is_active: boolean('is_active').default(true),
  created_at: timestamp('created_at').defaultNow(),
});

// Backgrounds
export const backgrounds = pgTable('backgrounds', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  background_url: text('background_url').notNull(),
  background_type: text('background_type').notNull().default('image'),
  is_muted: boolean('is_muted').default(false),
  is_active: boolean('is_active').default(true),
  sort_order: integer('sort_order').default(0),
  created_at: timestamp('created_at').defaultNow(),
});

// Social Links
export const socialLinks = pgTable('social_links', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  icon_type: text('icon_type').notNull(),
  url: text('url').notNull(),
  label: text('label').notNull(),
  link_location: text('link_location').default('home'),
  sort_order: integer('sort_order').default(0),
  is_active: boolean('is_active').default(true),
  created_at: timestamp('created_at').defaultNow(),
});

// Blocked IPs
export const blockedIps = pgTable('blocked_ips', {
  id: text('id').primaryKey(),
  ip_address: text('ip_address').notNull().unique(),
  reason: text('reason'),
  blocked_by: text('blocked_by'),
  created_at: timestamp('created_at').defaultNow(),
});

// Developer Access Logs
export const developerAccessLogs = pgTable('developer_access_logs', {
  id: text('id').primaryKey(),
  event: text('event').notNull(),
  device_id: text('device_id'),
  device_name: text('device_name'),
  device_info: jsonb('device_info'),
  ip_address: text('ip_address'),
  user_agent: text('user_agent'),
  geo_info: jsonb('geo_info'),
  is_approved_device: boolean('is_approved_device').default(false),
  created_at: timestamp('created_at').defaultNow(),
});

// Duration Codes
export const durationCodes = pgTable('duration_codes', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  duration_days: integer('duration_days').notNull(),
  max_uses_per_key: integer('max_uses_per_key').default(1),
  used_by: jsonb('used_by').default([]),
  is_active: boolean('is_active').default(true),
  expires_at: timestamp('expires_at'),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});

// Lua Scripts
export const luaScripts = pgTable('lua_scripts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  display_name: text('display_name').notNull(),
  description: text('description'),
  script_type: text('script_type').notNull().default('main'),
  content: text('content').notNull(),
  raw_content: text('raw_content'),
  backup_content: text('backup_content'),
  is_active: boolean('is_active').default(true),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});

// Lua Script Versions
export const luaScriptVersions = pgTable('lua_script_versions', {
  id: text('id').primaryKey(),
  script_id: text('script_id').notNull().references(() => luaScripts.id, { onDelete: 'cascade' }),
  version_number: integer('version_number').notNull(),
  display_name: text('display_name'),
  content: text('content').notNull(),
  created_at: timestamp('created_at').defaultNow(),
});

// Lua Script Versions Relations
export const luaScriptVersionsRelations = relations(luaScriptVersions, ({ one }) => ({
  script: one(luaScripts, {
    fields: [luaScriptVersions.script_id],
    references: [luaScripts.id],
  }),
}));

export const luaScriptsRelations = relations(luaScripts, ({ many }) => ({
  versions: many(luaScriptVersions),
}));

// Lua Recordings
export const luaRecordings = pgTable('lua_recordings', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  source: text('source').default('web'),
  game_id: text('game_id'),
  duration_seconds: integer('duration_seconds'),
  owner_key: text('owner_key'),
  owner_username: text('owner_username'),
  owner_hwid: text('owner_hwid'),
  recording_data: jsonb('recording_data').notNull(),
  is_public: boolean('is_public').default(false),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});

// Lua Recording Events
export const luaRecordingEvents = pgTable('lua_recording_events', {
  id: text('id').primaryKey(),
  recording_id: text('recording_id').notNull(),
  title: text('title').notNull(),
  event_type: text('event_type').notNull(),
  is_public: boolean('is_public').default(false),
  created_at: timestamp('created_at').defaultNow(),
});

// Lua Teleports
export const luaTeleports = pgTable('lua_teleports', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  source: text('source').default('web'),
  game_id: text('game_id'),
  owner_key: text('owner_key'),
  owner_username: text('owner_username'),
  owner_hwid: text('owner_hwid'),
  teleport_data: jsonb('teleport_data').notNull(),
  is_public: boolean('is_public').default(false),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});

// Package Discounts
export const packageDiscounts = pgTable('package_discounts', {
  id: text('id').primaryKey(),
  package_name: text('package_name'),
  discount_type: text('discount_type').notNull(),
  discount_percent: integer('discount_percent').default(0),
  discount_amount: integer('discount_amount').default(0),
  promo_code: text('promo_code'),
  description: text('description'),
  min_days: integer('min_days'),
  max_days: integer('max_days'),
  duration_exact: boolean('duration_exact').default(false),
  notify_users: boolean('notify_users').default(false),
  start_date: timestamp('start_date'),
  end_date: timestamp('end_date'),
  is_active: boolean('is_active').default(true),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});

// XCoins Balances
export const xcoinsBalances = pgTable('xcoins_balances', {
  id: text('id').primaryKey(),
  phone: text('phone').notNull().unique(),
  pin_hash: text('pin_hash').notNull(),
  display_name: text('display_name'),
  balance: integer('balance').default(0),
  is_active: boolean('is_active').default(true),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});

// XCoins OTP
export const xcoinsOtp = pgTable('xcoins_otp', {
  id: text('id').primaryKey(),
  phone: text('phone').notNull(),
  otp_code: text('otp_code').notNull(),
  is_used: boolean('is_used').default(false),
  expires_at: timestamp('expires_at').notNull(),
  created_at: timestamp('created_at').defaultNow(),
});

// XCoins Transactions
export const xcoinsTransactions = pgTable('xcoins_transactions', {
  id: text('id').primaryKey(),
  user_id: text('user_id').notNull().references(() => xcoinsBalances.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  amount: integer('amount').notNull(),
  balance_after: integer('balance_after').notNull(),
  description: text('description'),
  reference_id: text('reference_id'),
  created_at: timestamp('created_at').defaultNow(),
});

export const xcoinsTransactionsRelations = relations(xcoinsTransactions, ({ one }) => ({
  user: one(xcoinsBalances, {
    fields: [xcoinsTransactions.user_id],
    references: [xcoinsBalances.id],
  }),
}));
