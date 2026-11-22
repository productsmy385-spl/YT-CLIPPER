export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { dbRepo } from '@/db/repository';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status') || undefined;

    const creators = dbRepo.listCreators();
    const permissions = dbRepo.listCreatorPermissions({ status });
    const recentChecks = dbRepo.listSourceRightsChecks(50);
    const attributions = dbRepo.listAttributionRecords(50);

    const summary = {
      totalCreators: creators.length,
      verified: permissions.filter((p: any) => p.status === 'VERIFIED').length,
      creativeCommons: recentChecks.filter((c: any) => c.status === 'CREATIVE_COMMONS').length,
      pending: permissions.filter((p: any) => p.status === 'PENDING').length,
      expired: permissions.filter((p: any) => p.status === 'EXPIRED').length,
      rejected: permissions.filter((p: any) => p.status === 'REJECTED').length,
    };

    return NextResponse.json({
      success: true,
      creators,
      permissions,
      recentChecks,
      attributions,
      summary,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === 'create_creator') {
      const creatorId = body.id || `creator_${Date.now()}`;
      dbRepo.saveCreator({
        id: creatorId,
        name: body.name,
        channelId: body.channelId,
        channelUrl: body.channelUrl,
        contactEmail: body.contactEmail,
        status: body.status || 'verified',
        notes: body.notes,
      });

      if (body.grantPermission) {
        dbRepo.saveCreatorPermission({
          id: `perm_${creatorId}`,
          creatorId,
          channelId: body.channelId,
          status: body.permissionStatus || 'VERIFIED',
          startDate: body.startDate || new Date().toISOString(),
          expiryDate: body.expiryDate || null,
          allowedUsage: body.allowedUsage || 'all',
          commercialUsageAllowed: body.commercialUsageAllowed ?? false,
          editingAllowed: body.editingAllowed ?? true,
          republishingAllowed: body.republishingAllowed ?? true,
          mediaAccessMethod: body.mediaAccessMethod || 'authorized_upload',
          notes: body.notes,
        });
      }

      return NextResponse.json({ success: true, creatorId });
    }

    if (action === 'update_permission') {
      const permId = body.id || `perm_${body.creatorId}_${Date.now()}`;
      dbRepo.saveCreatorPermission({
        id: permId,
        creatorId: body.creatorId,
        channelId: body.channelId,
        status: body.status, // VERIFIED, PENDING, REJECTED, EXPIRED
        startDate: body.startDate,
        expiryDate: body.expiryDate,
        allowedUsage: body.allowedUsage,
        commercialUsageAllowed: body.commercialUsageAllowed,
        editingAllowed: body.editingAllowed,
        republishingAllowed: body.republishingAllowed,
        mediaAccessMethod: body.mediaAccessMethod,
        notes: body.notes,
      });

      return NextResponse.json({ success: true, permissionId: permId });
    }

    if (action === 'add_evidence') {
      const evidenceId = `ev_${Date.now()}`;
      dbRepo.savePermissionEvidence({
        id: evidenceId,
        permissionId: body.permissionId,
        creatorId: body.creatorId,
        documentType: body.documentType,
        documentUrl: body.documentUrl,
        notes: body.notes,
        uploadedBy: body.uploadedBy || 'admin',
      });

      return NextResponse.json({ success: true, evidenceId });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
