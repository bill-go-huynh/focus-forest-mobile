import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useRef } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { View } from 'react-native';

import type { Profile } from '../../../api';
import { FormMessage } from '../../../auth';
import { Button } from '../../../components/Button';
import { ErrorState } from '../../../components/ErrorState';
import { Input, type InputHandle } from '../../../components/Input';
import { ListRow } from '../../../components/ListRow';
import { Screen } from '../../../components/Screen';
import { Skeleton, SkeletonGroup } from '../../../components/Skeleton';
import {
  BIO_MAX,
  DISPLAY_NAME_MAX,
  describeSaveError,
  formatJoinMonth,
  profileChanges,
  profileFormSchema,
  useProfile,
  useUpdateProfile,
  type ProfileFormValues,
} from '../../../profile';
import { useTheme } from '../../../theme';

/** Edit profile: display name and bio (A4). The join date is shown, never edited. */
export default function EditProfileScreen() {
  const theme = useTheme();
  const { data: profile, isPending, isError, refetch } = useProfile();

  return (
    <Screen safeTop={false}>
      {isPending ? (
        <SkeletonGroup label="Loading your profile">
          <Skeleton variant="text" lines={4} />
        </SkeletonGroup>
      ) : isError ? (
        <ErrorState
          message="We couldn't load your profile right now."
          onRetry={() => void refetch()}
        />
      ) : (
        <View style={{ gap: theme.space[6] }}>
          <EditProfileForm profile={profile} />
        </View>
      )}
    </Screen>
  );
}

function EditProfileForm({ profile }: { profile: Profile }) {
  const theme = useTheme();
  const router = useRouter();
  const save = useUpdateProfile();
  const bioRef = useRef<InputHandle>(null);
  const hasName = profile.displayName !== null;
  const { control, handleSubmit } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema({ hasName })),
    defaultValues: { displayName: profile.displayName ?? '', bio: profile.bio ?? '' },
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  });
  const bio = useWatch({ control, name: 'bio' });

  const submit = handleSubmit(async (values) => {
    if (save.isPending) return;
    const changes = profileChanges(profile, values);
    if (Object.keys(changes).length === 0) {
      router.back();
      return;
    }
    try {
      await save.mutateAsync(changes);
      router.back();
    } catch {
      // Shown below from save.error; the edits stay in the form.
    }
  });

  return (
    <>
      <View style={{ gap: theme.space[4] }}>
        <Controller
          control={control}
          name="displayName"
          render={({ field, fieldState }) => (
            <Input
              ref={field.ref}
              label="Name"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              helper={
                hasName
                  ? 'This is how Focus Forest greets you.'
                  : 'Add the name you would like to be called.'
              }
              maxLength={DISPLAY_NAME_MAX}
              autoComplete="name"
              textContentType="nickname"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => bioRef.current?.focus()}
            />
          )}
        />
        <Controller
          control={control}
          name="bio"
          render={({ field, fieldState }) => (
            <Input
              ref={bioRef}
              label="Bio"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              helper={`${bio.length} / ${BIO_MAX}`}
              maxLength={BIO_MAX}
              multiline
            />
          )}
        />
        <ListRow title="Joined" meta={formatJoinMonth(profile.joinDate, profile.timezone)} />
      </View>
      {save.isError ? <FormMessage message={describeSaveError(save.error)} /> : null}
      <Button
        variant="primary"
        label={save.isPending ? 'Saving…' : 'Save'}
        onPress={submit}
        disabled={save.isPending}
      />
    </>
  );
}
