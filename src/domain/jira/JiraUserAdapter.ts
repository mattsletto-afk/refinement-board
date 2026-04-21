import type { CwdUser, AppUser, JiraPersona as Persona } from './types'

export function adaptJiraUser(cwdUser: CwdUser, appUser: AppUser): Persona {
  return {
    userKey: appUser.user_key,
    userName: cwdUser.user_name,
    displayName: cwdUser.display_name,
    emailAddress: cwdUser.email_address,
    active: cwdUser.active,
    externalId: cwdUser.external_id,
    directoryId: cwdUser.directory_id,
    createdDate: cwdUser.created_date,
    updatedDate: cwdUser.updated_date,
  }
}

export function adaptJiraUsers(
  cwdUsers: CwdUser[],
  appUsers: AppUser[]
): Persona[] {
  const appUserByLowerName = new Map<string, AppUser>(
    appUsers.map((u) => [u.lower_user_name, u])
  )

  const personas: Persona[] = []

  for (const cwdUser of cwdUsers) {
    const appUser = appUserByLowerName.get(cwdUser.lower_user_name)
    if (appUser === undefined) {
      continue
    }
    personas.push(adaptJiraUser(cwdUser, appUser))
  }

  return personas
}

export function buildUserKeyIndex(personas: Persona[]): Map<string, Persona> {
  return new Map(personas.map((p) => [p.userKey, p]))
}

export function buildUserNameIndex(personas: Persona[]): Map<string, Persona> {
  return new Map(personas.map((p) => [p.userName.toLowerCase(), p]))
}

