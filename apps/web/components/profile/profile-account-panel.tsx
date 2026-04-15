"use client";

import { IconAlertTriangle, IconTrash } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ProfileAccountPanel() {
  return (
    <div className="max-w-2xl">
      <Card className="border-red-200 dark:border-red-900/50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <IconAlertTriangle className="h-5 w-5 text-red-500" />
            <CardTitle className="text-base text-red-600 dark:text-red-400">Danger zone</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Delete account</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Permanently delete your account and all data. This cannot be undone.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled
              className="shrink-0 cursor-not-allowed border-red-200 text-red-400 dark:border-red-900/60"
              title="Contact support to delete your account"
            >
              <IconTrash className="size-4" aria-hidden />
              Delete account
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Contact{" "}
            <a
              href="mailto:support@echo.ai"
              className="font-medium text-primary underline underline-offset-2"
            >
              support@echo.ai
            </a>{" "}
            to request account deletion.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
