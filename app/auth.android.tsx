// Expo Router includes all route siblings in its context. Resolve the actual
// implementation outside app/ so iOS never packages the Android auth changes.
export { default } from "@/components/android-only/AuthScreen";
