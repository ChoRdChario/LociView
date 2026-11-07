import {test as base, type TestInfo} from '@playwright/test';
import {lstat, mkdtemp, realpath, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename, dirname, join, resolve} from 'node:path';

interface ProfileRoot {path:string; canonical:string; parent:string}
interface ProfileOwner {root?:Promise<ProfileRoot>; profiles:string[]}
const owners = new WeakMap<TestInfo, ProfileOwner>();

async function newRoot():Promise<ProfileRoot> {
  const parent = await realpath(tmpdir()), path = await mkdtemp(join(parent, 'lv-e2e-'));
  return {path, canonical:await realpath(path), parent};
}

async function checkOwner(root:ProfileRoot) {
  const target = resolve(root.path), stat = await lstat(target);
  if (!stat.isDirectory() || stat.isSymbolicLink() ||
      !basename(target).startsWith('lv-e2e-') ||
      dirname(root.canonical) !== root.parent ||
      await realpath(target) !== root.canonical)
    throw Error('Refusing cleanup of a changed browser-profile owner.');
}

/** Only newly allocated synthetic profiles belong to this fixture. */
export const test = base.extend<{lvBrowserProfiles:void}>({
  lvBrowserProfiles:[async ({}, use, info) => {
    const owner:ProfileOwner = {profiles:[]}; owners.set(info, owner);
    try { await use(); }
    finally {
      owners.delete(info);
      // Allocation errors already fail the calling test; there is no root to remove.
      const root = await owner.root?.catch(() => undefined);
      if (root) {
        let disposition = 'retained-after-failure', unsafe:unknown, cleanupCode:string|undefined;
        if (info.status === 'passed' && info.expectedStatus === 'passed') {
          try { await checkOwner(root); }
          catch (error) { unsafe = error; disposition = 'refused-changed-owner'; }
          if (!unsafe) {
            try { await rm(root.canonical, {recursive:true}); disposition = 'removed-after-pass'; }
            catch (error) {
              cleanupCode = (error as NodeJS.ErrnoException).code;
              disposition = 'retained-after-cleanup-error';
              console.warn('Owned browser-profile cleanup retained its directory:', cleanupCode);
            }
          }
        }
        await info.attach('browser-profile-lifecycle', {
          body:JSON.stringify({root:root.path, profiles:owner.profiles, disposition, cleanupCode}),
          contentType:'application/json',
        });
        if (unsafe) throw unsafe;
      }
    }
  }, {auto:true}],
});

/** Allocate once per participant, then reuse this exact path for cold reopen. */
export async function createBrowserProfile(label:string):Promise<string> {
  if (!/^[a-z0-9][a-z0-9_-]{0,39}$/i.test(label)) throw Error('Use a short ASCII browser-profile label.');
  const owner = owners.get(test.info());
  if (!owner) throw Error('Browser profiles require the owning test fixture.');
  const root = await (owner.root ??= newRoot());
  const profile = await mkdtemp(join(root.path, label + '-')); owner.profiles.push(profile);
  return profile;
}
