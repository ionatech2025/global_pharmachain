"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  COMPANY_TYPE_LABELS,
  COMPANY_TYPES,
  COUNTRIES,
  type CompanyType,
  detectUserCountry,
  PASSWORD_HINT,
  type RegisterInput,
  registerSchema,
} from "@pharmachain/core";
import { Button } from "@pharmachain/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pharmachain/ui/components/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@pharmachain/ui/components/form";
import { Input } from "@pharmachain/ui/components/input";
import { PasswordInput } from "@pharmachain/ui/components/password-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@pharmachain/ui/components/select";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { api } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/http";

function RegisterFormInner({ ipCountry }: { ipCountry: string | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryType = searchParams.get("type") as CompanyType | null;
  const initialType: CompanyType =
    queryType && COMPANY_TYPES.includes(queryType) ? queryType : "RAW_MATERIAL_MANUFACTURER";

  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    mode: "onTouched",
    defaultValues: {
      company: {
        name: "",
        type: initialType,
        country: "",
        registrationNumber: "",
        address: "",
        contactPhone: "",
      },
      admin: { name: "", email: "", password: "" },
    },
  });

  // Pre-select the applicant's country: from their IP (resolved on the server)
  // or, failing that, their timezone. When neither is known the field stays
  // empty and asks — a wrong country defaulted onto a regulatory registration is
  // worse than one extra click, so there is deliberately no fallback value.
  useEffect(() => {
    if (!form.getValues("company.country")) {
      const detected = ipCountry ?? detectUserCountry();
      if (detected) form.setValue("company.country", detected, { shouldValidate: true });
    }
  }, [form, ipCountry]);

  // If query param type changes, update form
  useEffect(() => {
    if (queryType && COMPANY_TYPES.includes(queryType)) {
      form.setValue("company.type", queryType);
    }
  }, [queryType, form]);

  async function onSubmit(values: RegisterInput) {
    try {
      await api.post("/auth/register", values);
      toast.success("Company registered successfully! Redirecting to sign in…");
      router.push(`/login?registered=1&email=${encodeURIComponent(values.admin.email)}`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>Register your company</h1>
        </CardTitle>
        <CardDescription>
          Self-service onboarding — your company starts in “pending verification” until our team
          reviews your compliance documents.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
            <FormField
              control={form.control}
              name="company.name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Company name</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="organization"
                      placeholder="e.g. Apex Pharma International"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="company.type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Company type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select company type…" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="max-h-72">
                      {COMPANY_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {COMPANY_TYPE_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="company.country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Country</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || undefined}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select country…" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="max-h-72">
                        {COUNTRIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="company.registrationNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Registration number</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. RC-9823412" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="company.address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Registered address</FormLabel>
                  <FormControl>
                    <Input placeholder="Street, City, Postal Code" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="company.contactPhone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contact phone</FormLabel>
                  <FormControl>
                    <Input type="tel" autoComplete="tel" placeholder="+256 700 000000" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="mt-2 border-t pt-4">
              <p className="mb-3 text-sm font-medium">Company admin account</p>
              <div className="grid gap-4">
                <FormField
                  control={form.control}
                  name="admin.name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full name</FormLabel>
                      <FormControl>
                        <Input autoComplete="name" placeholder="e.g. Dr. Jane Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="admin.email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Work email</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            autoComplete="email"
                            placeholder="jane@company.com"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="admin.password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <PasswordInput autoComplete="new-password" {...field} />
                        </FormControl>
                        <FormDescription>{PASSWORD_HINT}</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </div>
            <Button type="submit" disabled={form.formState.isSubmitting} className="w-full">
              {form.formState.isSubmitting ? "Registering…" : "Register company"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

export function RegisterForm({ ipCountry }: { ipCountry: string | null }) {
  return (
    <Suspense
      fallback={<div className="p-8 text-center text-muted-foreground">Loading registration…</div>}
    >
      <RegisterFormInner ipCountry={ipCountry} />
    </Suspense>
  );
}
