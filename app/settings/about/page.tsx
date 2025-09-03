"use client"

import React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function AboutSettingsPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>关于应用</CardTitle>
        <CardDescription>
          查看应用程序信息和版本详情
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-center py-12 text-muted-foreground">
          关于页面功能即将推出...
        </div>
      </CardContent>
    </Card>
  )
}