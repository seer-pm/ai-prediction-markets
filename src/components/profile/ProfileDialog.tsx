import { AccountLabel, Button, Dialog, ErrorPanel, Field, TextInput } from "@/components/ui";
import { AvatarPicker } from "./AvatarPicker";
import { useProfiles } from "@/hooks/useProfiles";
import { useSaveProfile } from "@/hooks/useSaveProfile";
import {
  MAX_DISPLAY_NAME,
  avatarUrlError,
  displayNameError,
  normalizeAvatarUrl,
  normalizeXHandle,
  sanitizeDisplayName,
  xHandleError,
  type Profile,
} from "@/utils/profile";
import { useEffect, useMemo, useState } from "react";
import type { Address } from "viem";

/**
 * Edit the name, picture and X handle shown against this wallet on the leaderboard.
 *
 * Saving costs a wallet signature, which is what proves the address is yours — there is no
 * account system here, and no server-side session. Nothing is sent until that is signed.
 *
 * Validation runs through `@/utils/profile`, the same module the write endpoint uses, so the form
 * can never accept something the server will reject.
 */
export function ProfileDialog({
  open,
  onOpenChange,
  account,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: Address;
}) {
  const profiles = useProfiles(useMemo(() => [account], [account]));
  const stored = profiles[account.toLowerCase()];

  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [xHandle, setXHandle] = useState("");
  const [touched, setTouched] = useState(false);

  const save = useSaveProfile(account);

  // Reload from the stored profile each time the dialog opens, so a cancelled edit is discarded
  // and a save made in another tab is picked up.
  useEffect(() => {
    if (!open) return;
    setDisplayName(stored?.displayName ?? "");
    setAvatarUrl(stored?.avatarUrl ?? "");
    setXHandle(stored?.xHandle ?? "");
    setTouched(false);
    save.reset();
    // `save` is a stable mutation object; re-running on every render of it would clear the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stored?.displayName, stored?.avatarUrl, stored?.xHandle]);

  // Validate the normalised values — those are what get signed and stored, so an error on the
  // raw text would point at something the user never submits.
  const cleanName = sanitizeDisplayName(displayName);
  const cleanAvatar = normalizeAvatarUrl(avatarUrl);
  const cleanHandle = normalizeXHandle(xHandle);

  const nameError = displayNameError(cleanName);
  const avatarError = avatarUrlError(cleanAvatar);
  const handleError = xHandleError(cleanHandle);
  const invalid = !!(nameError || avatarError || handleError);

  // Invalid fields are dropped rather than previewed: a malformed handle would render a link to
  // nowhere, and a broken picture URL is better shown as the identicon it will fall back to.
  const preview: Profile = {
    ...(nameError ? {} : { displayName: cleanName }),
    ...(avatarError ? {} : { avatarUrl: cleanAvatar }),
    ...(handleError ? {} : { xHandle: cleanHandle }),
    updatedAt: "",
  };

  const submit = () => {
    setTouched(true);
    if (invalid) return;
    save.mutate(
      { displayName, avatarUrl, xHandle },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title="Your profile"
      description="Shown against your wallet on the leaderboard. Anyone can see it."
      dismissible={!save.isPending}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={save.isPending} fullWidth>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            loading={save.isPending}
            disabled={touched && invalid}
            disabledReason={touched && invalid ? "Fix the fields above first." : undefined}
            fullWidth
          >
            Sign and save
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field
          label="Display name"
          error={touched ? (nameError ?? undefined) : undefined}
          hint={`Up to ${MAX_DISPLAY_NAME} characters. Leave it empty to show your ENS name or address.`}
        >
          <TextInput
            value={displayName}
            maxLength={MAX_DISPLAY_NAME}
            placeholder="How you want to be listed"
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </Field>

        <Field
          label="Profile picture"
          error={touched ? (avatarError ?? undefined) : undefined}
          hint="Uploaded images are pinned to IPFS and served from a public gateway."
        >
          <AvatarPicker
            address={account}
            value={avatarUrl}
            onChange={setAvatarUrl}
            error={touched ? (avatarError ?? undefined) : undefined}
          />
        </Field>

        <Field
          label="X handle"
          error={touched ? (handleError ?? undefined) : undefined}
          hint="With or without the @, or paste the full link."
        >
          <TextInput
            value={xHandle}
            placeholder="@yourhandle"
            onChange={(event) => setXHandle(event.target.value)}
          />
        </Field>

        {/* The real row component, fed the values as typed — so what is shown here is literally
            what the leaderboard will render, down to the identicon fallback. */}
        <div className="rounded-lg bg-sunken px-4 py-3">
          <p className="text-label font-semibold tracking-wider text-ink-3 uppercase">
            How your row will look
          </p>
          <div className="mt-2">
            <AccountLabel address={account} profile={preview} />
          </div>
        </div>

        {save.isError && <ErrorPanel title="Your profile was not saved" error={save.error} />}
      </div>
    </Dialog>
  );
}
