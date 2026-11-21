import { NextRequest, NextResponse } from 'next/server';
import { dbRepo } from '@/db/repository';
import { STORAGE_AVATARS_DIR } from '@/lib/app-paths';
import path from 'node:path';
import fs from 'node:fs';

const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5MB limit
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('avatar') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No image file provided' }, { status: 400 });
    }

    if (file.size > MAX_AVATAR_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds 5MB limit (${(file.size / (1024 * 1024)).toFixed(1)}MB)` },
        { status: 400 }
      );
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file format. Please upload a PNG, JPEG, or WebP image.' },
        { status: 400 }
      );
    }

    // Determine extension
    const ext = file.name.split('.').pop() || 'png';
    const filename = `avatar_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const destinationPath = path.resolve(STORAGE_AVATARS_DIR, filename);

    // Save buffer to storage/avatars
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(destinationPath, buffer);

    const avatarUrl = `/api/media/avatar/${filename}`;

    // Update user record in database
    const updatedUser = dbRepo.updateUserProfile('usr_creator_01', {
      avatar_url: avatarUrl,
    });

    const initials = updatedUser.name
      ? updatedUser.name
          .split(' ')
          .map((n: string) => n[0])
          .join('')
          .toUpperCase()
          .slice(0, 2)
      : 'VC';

    return NextResponse.json({
      success: true,
      message: 'Avatar updated successfully',
      avatarUrl,
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        avatarUrl: updatedUser.avatar_url,
        initials,
      },
    });
  } catch (error: any) {
    console.error('[AvatarAPI] Error uploading avatar:', error);
    return NextResponse.json({ error: error.message || 'Failed to upload avatar' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const user = dbRepo.getUser('usr_creator_01');

    // Remove file if local avatar
    if (user.avatar_url && user.avatar_url.includes('/api/media/avatar/')) {
      const filename = path.basename(user.avatar_url);
      const filePath = path.resolve(STORAGE_AVATARS_DIR, filename);
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch {}
      }
    }

    // Set avatar_url = null in DB
    const updatedUser = dbRepo.updateUserProfile('usr_creator_01', {
      avatar_url: null,
    });

    const initials = updatedUser.name
      ? updatedUser.name
          .split(' ')
          .map((n: string) => n[0])
          .join('')
          .toUpperCase()
          .slice(0, 2)
      : 'VC';

    return NextResponse.json({
      success: true,
      message: 'Avatar removed successfully',
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        avatarUrl: null,
        initials,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
