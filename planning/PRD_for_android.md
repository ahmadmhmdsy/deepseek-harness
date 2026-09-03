Product Requirements Document

Working product name: StrideTrust

Platform: Android

Technology preference: Kotlin, Jetpack Compose, Health Connect

Document status: MVP definition

Version: 1.0



1\. Product overview

StrideTrust is a privacy-first Android step tracker that provides reliable step data, adaptive walking goals, and simple habit coaching without requiring an account or GPS.



The app will differentiate itself from Samsung Health, Google Health, Pacer, StepsApp, and reward-based apps by focusing on four problems: unreliable background tracking, conflicting phone and wearable totals, unrealistic fixed goals, and excessive advertising. Existing apps often focus on large health ecosystems, social challenges, GPS routes, or rewards rather than making the basic step-tracking experience trustworthy. Pacer and WeWard reviews, for example, include complaints about goal restrictions, missing or incorrectly loaded steps, advertising, and payout problems.



Google Health is now centralizing Fitbit and other wellness data, while the Google Fit APIs are being deprecated during 2026. The app should therefore use Health Connect as its main health-data integration rather than building directly around Google Fit.



Product vision



Help people build a sustainable walking habit by showing trustworthy movement data and goals that adapt to real life.



Primary value proposition



“Know what you actually walked, understand your progress, and receive a realistic goal for today.”



Target users



User	Main need

Beginner walker	A simple way to start moving without being overwhelmed.

Existing step-counter user	More reliable tracking and fewer missed days.

Wearable owner	One consistent total across phone, watch, and health apps.

Busy adult	Goals that adapt to work, travel, weekends, and low-energy days.

Older or less technical user	Large, clear information and minimal setup.

Privacy-conscious user	Tracking without an account, GPS, or unnecessary permissions.

Recovery or low-activity user	Minimum goals, rest days, and gradual progression.

Business objective



Build a trusted, low-friction step-tracking product with a strong free core and optional paid features such as advanced coaching, cloud backup, and group challenges.



2\. Goals and requirements

MVP goals



Count and display daily steps reliably.



Integrate with Health Connect.



Support phone-only tracking where possible.



Prevent or explain duplicate data from multiple sources.



Provide minimum, target, and stretch goals.



Adapt goals using the user’s historical activity.



Work without an account and without GPS.



Explain tracking and synchronization problems.



Use no full-screen advertisements.



Provide accessible large-text and high-contrast modes.



Non-goals for MVP



Food and calorie tracking.



Sleep tracking.



Medical diagnosis or medical recommendations.



Reward currency or cash payouts.



Public social network.



Route discovery and map marketplace.



Personal trainer or AI health diagnosis.



Full wearable-device management.



Integration with every fitness platform.



Functional requirements

ID	Requirement	Priority	Acceptance criteria

FR-01	Onboarding	Must	The user can begin tracking in fewer than five screens.

FR-02	Health Connect integration	Must	The user can grant step permission and see the connection status. Health Connect provides a standard StepsRecord data type for step counts.

FR-03	Local sensor fallback	Must	If Health Connect is unavailable, the app attempts phone-sensor tracking and clearly labels the data source.

FR-04	Daily dashboard	Must	The dashboard shows steps, progress, distance estimate, active minutes, goal status, and last synchronization time.

FR-05	Source transparency	Must	The user can see whether data came from the phone, watch, Health Connect, or manual entry.

FR-06	Duplicate detection	Must	Overlapping step records are detected and excluded from the displayed total where possible.

FR-07	Goal levels	Must	The app provides minimum, target, and stretch goals.

FR-08	Adaptive goals	Must	The app adjusts the target gradually based on recent activity and never increases it abruptly without user approval.

FR-09	Rest and recovery mode	Must	The user can reduce or pause the goal for a selected period without losing historical data.

FR-10	History	Must	The user can view daily, weekly, and monthly step history.

FR-11	Manual correction	Should	The user can add or remove a step adjustment while preserving an audit record.

FR-12	Walking session	Should	The user can manually start a walk and optionally enable GPS. GPS must not be required for normal step counting.

FR-13	Offline mode	Must	Daily tracking and the main dashboard work without an internet connection.

FR-14	Privacy controls	Must	The user can view permissions, disconnect Health Connect, export data, and delete local data.

FR-15	Notifications	Should	The user can receive optional progress reminders and end-of-day summaries.

FR-16	Accessibility	Must	The app supports large text, TalkBack labels, high contrast, and touch-friendly controls.

Goal algorithm

The initial version should avoid assigning every user a fixed 10,000-step goal.



After the first seven complete tracking days:



Baseline

=

median

⁡

(

daily steps over the first 7 days

)

Baseline=median(daily steps over the first 7 days)

Suggested initial targets:



Minimum goal: approximately 60% of baseline.



Target goal: approximately 100% of baseline.



Stretch goal: approximately 120% of baseline.



These are product defaults, not medical recommendations. Users must be able to customize them.



The goal engine should:



Ignore obvious incomplete tracking days.



Avoid increasing the goal by more than 5–10% per week.



Stop increasing the goal when the user repeatedly misses it.



Reduce the goal during recovery mode.



Allow the user to lock the goal manually.



Treat rest days as intentional rather than failed days.



Example:



Day type	Goal

Minimum	3,000

Target	5,000

Stretch	6,000

If the user reaches only 3,000 steps on a difficult day, the app should show:



“Minimum goal completed. Today still counts.”



3\. User experience

Main user flow

User opens the app.



App explains that it needs access only to step data.



User grants Health Connect permission.



App checks whether data is available.



User selects a starting goal or accepts the recommended goal.



Dashboard begins displaying progress.



App gradually learns the user’s activity baseline.



User receives a daily summary and weekly progress explanation.



Main screens

Onboarding



Welcome message.



Privacy explanation.



Health Connect permission.



Optional notification permission.



Goal preference.



Carrying mode: pocket, hand, bag, backpack, or wearable.



Today dashboard



Display:



Current step total.



Progress ring for the selected goal.



Minimum, target, and stretch goals.



Active minutes.



Distance estimate.



Last synchronization time.



Data-source label.



Short recommendation.



Example:



4,860 steps

140 steps to your target

Your phone data is current to 8:42 PM.



Goal screen



The user can:



Choose minimum, target, and stretch goals.



Enable adaptive goals.



Lock goals manually.



Set a rest day.



Enable recovery mode.



Select weekdays with different targets.



History screen



Include:



Today, week, month, and year views.



Average daily steps.



Best day.



Number of completed minimum goals.



Number of rest days.



Missing-data warnings.



Source breakdown.



The app should emphasize consistency rather than only the highest step count.



Trust center



This is a key differentiator.



Display:



Health Connect connection status.



Phone-sensor status.



Last successful data read.



Permissions.



Battery-restriction warning.



Data sources.



Duplicate records removed.



Missing time periods.



Manual corrections.



Example:



Your watch and phone overlap between 7:00 AM and 8:10 AM. We counted the overlapping period once.



Walking session



The user can start:



Indoor walk.



Outdoor walk.



Treadmill walk.



Manual activity session.



GPS is optional and only activated when the user chooses an outdoor route. The app should clearly warn that continuous GPS may reduce battery life.



Notifications



Optional notifications:



Morning goal reminder.



Midday progress.



“You are close to your minimum goal.”



Evening summary.



Weekly progress report.



Tracking failure notification.



Notifications must be configurable and disabled by default for users who prefer a quiet experience.



Product tone

The app should be:



Supportive.



Non-judgmental.



Clear.



Calm.



Practical.



Free from guilt-based messages.



Avoid messages such as:



“You failed today.”



Use:



“Today was below your usual activity. Your minimum goal is still available.”



4\. Technical design

Recommended architecture

Use a standard Android layered architecture:



Presentation layer: Jetpack Compose and Material 3.



View model layer: Kotlin ViewModel, StateFlow, and unidirectional data flow.



Domain layer: goal calculation, source reconciliation, progress calculation, and notification rules.



Data layer: Health Connect adapter, local sensor adapter, Room database, DataStore preferences.



Background layer: WorkManager for periodic synchronization and data maintenance.



Dependency injection: Hilt.



Testing: Kotlin tests, Compose UI tests, and device tests.



Data strategy

Health Connect should be the primary integration layer because it can provide step records from supported health and wearable apps.



The application should use this hierarchy:



Health Connect data.



Android phone sensor fallback.



Optional manual entry.



The app should not write calculated or duplicated data back into Health Connect during the MVP. It should read data and calculate the user-facing total locally. This reduces the risk of polluting the user’s health data with duplicate records.



Suggested local data model

DailySummary



id



date



stepCount



distanceMeters



activeMinutes



minimumGoal



targetGoal



stretchGoal



goalStatus



dataConfidence



lastSyncedAt



StepSourceRecord



id



sourcePackage



sourceName



startTime



endTime



stepCount



sourceType



isOverlapping



isIncluded



createdAt



UserGoalSettings



minimumGoal



targetGoal



stretchGoal



adaptiveGoalsEnabled



restDays



recoveryModeEnabled



recoveryEndDate



lockedGoal



weekendAdjustmentEnabled



ManualAdjustment



id



date



amount



reason



createdAt



Permissions

Request permissions progressively:



Step read permission through Health Connect: required.



Activity-recognition permission: only if required for the phone-sensor fallback.



Notifications: optional.



Location: only when the user starts a GPS walking session.



Account access: not required for MVP.



Never request location simply to count steps.



Battery and reliability

The app must:



Avoid continuous GPS for normal tracking.



Avoid unnecessary foreground services.



Explain battery optimization issues rather than silently losing data.



Show the last successful synchronization time.



Detect unusually long periods without new records.



Use scheduled synchronization rather than constantly polling.



Avoid claiming that step data is perfectly real-time.



Because Android and different phone manufacturers handle background activity differently, reliability must be tested across Samsung, Pixel, Xiaomi, and at least one lower-cost Android device.



Privacy and security

MVP privacy principles:



No account required.



No advertising SDK in the core app.



No location collection unless GPS walking is enabled.



No sale of health data.



Local-first storage.



Explicit Health Connect permissions.



Clear data deletion.



Optional encrypted backup in a later version.



No sharing of step totals without explicit consent.



The app should include a plain-language privacy screen:



“StrideTrust reads your step data to display your progress. It does not need your location to count steps.”



Monetization

Free tier



Step tracking.



Health Connect integration.



Basic history.



Minimum, target, and stretch goals.



Basic adaptive goals.



Offline use.



Privacy controls.



Premium tier, later



Advanced goal analysis.



Cloud backup.



Multiple profiles.



Custom reports.



Group challenges.



Export formats.



Advanced coaching.



Wearable-specific reconciliation tools.



Avoid monetizing the primary step count through full-screen advertisements. Advertising is a major frustration in generic pedometers and reward applications.



5\. Launch plan and metrics

Release phases

Phase 1: Tracking foundation



Kotlin and Compose project.



Onboarding.



Health Connect permission.



Daily step dashboard.



Local database.



Basic history.



Privacy controls.



Phase 2: Trust and personalization



Source reconciliation.



Duplicate detection.



Tracking health screen.



Minimum, target, and stretch goals.



Adaptive goals.



Rest and recovery mode.



Battery troubleshooting.



Phase 3: Walking experience



Optional walking sessions.



Indoor and treadmill modes.



Optional GPS.



Carrying modes.



Notifications.



Accessibility improvements.



Phase 4: Retention features



Weekly reports.



Private challenges.



Family or friend groups.



Premium backup.



Advanced reports.



Optional integrations beyond Health Connect.



Success metrics

Activation



At least 70% of new users complete Health Connect setup.



At least 60% reach the dashboard after onboarding.



At least 50% record activity on their first day.



Reliability



Fewer than 5% of active users report a missing full day of data.



Fewer than 5% report duplicate counting.



At least 90% of active users see a successful synchronization within 24 hours.



Battery impact remains acceptable on tested devices.



Retention



Day-1 retention.



Day-7 retention.



Day-30 retention.



Percentage of users completing their minimum goal on at least four days per week.



Trust



Percentage of users who open the Trust Center.



Percentage of users who understand their data source.



Number of manual corrections per user.



Number of tracking-related support requests.



User rating for “I trust the step count.”



Validation interviews



Before building the full product, test a clickable prototype with:



Samsung phone users.



Pixel phone users.



Users with and without smartwatches.



Beginners.



Older users.



Users who have experienced missing or duplicate steps.



Privacy-conscious users.



The central validation question is:



“Would you replace your current step app with one that gives you a more explainable and trustworthy number, even if it has fewer health features?”



The first release should not try to beat Samsung Health or Google Health at all-in-one wellness. It should win one narrow category: the most trustworthy and least frustrating Android walking tracker.
