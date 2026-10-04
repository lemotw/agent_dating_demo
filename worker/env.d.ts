/** Worker bindings used by application code.
 *
 * Keep this declaration aligned with wrangler.jsonc. Wrangler-generated
 * worker-configuration.d.ts will merge with this interface.
 */
interface Env {
  TURN_KEY_ID: string;
  TURN_KEY_API_TOKEN: string;
}
