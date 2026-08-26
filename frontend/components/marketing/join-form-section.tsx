'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { submitInquiry } from '@/lib/api/public';
import {
  inquirySchema,
  isConsumerEmail,
  type InquiryFormValues,
} from '@/lib/marketing/inquiry-schema';
import { SA_PROVINCES, REFERRAL_SOURCES } from '@/lib/marketing/constants';
import {
  SUBSCRIPTION_PLANS,
  marketingPlanLabel,
  marketingSeatDescription,
  type SubscriptionPlan,
} from '@/lib/subscription-plans';
import { SectionReveal } from './section-reveal';

const inputFocusClass =
  'text-base focus-visible:ring-2 focus-visible:ring-secondary focus-visible:border-secondary';

interface JoinFormSectionProps {
  requestedPlan?: SubscriptionPlan | null;
  onRequestedPlanChange?: (plan: SubscriptionPlan) => void;
}

export function JoinFormSection({
  requestedPlan,
  onRequestedPlanChange,
}: JoinFormSectionProps) {
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<InquiryFormValues>({
    resolver: zodResolver(inquirySchema),
    defaultValues: {
      full_name: '',
      email: '',
      phone: '',
      practice_name: '',
      hpcsa_number: '',
      province: undefined,
      city: '',
      requested_subscription_plan: undefined,
      referral_source: '',
      message: '',
    },
  });

  useEffect(() => {
    if (requestedPlan) {
      form.setValue('requested_subscription_plan', requestedPlan, { shouldValidate: true });
    }
  }, [requestedPlan, form]);

  const onSubmit = async (values: InquiryFormValues) => {
    if (isConsumerEmail(values.email)) {
      toast.warning('We recommend using a professional email address for your practice.');
    }

    try {
      await submitInquiry(values);
      setSubmitted(true);
      form.reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit. Please try again.');
    }
  };

  if (submitted) {
    return (
      <section id="join" className="relative overflow-hidden py-20 sm:py-24">
        <div className="absolute inset-0 bg-[#0F4C81]" />
        <div className="relative mx-auto max-w-2xl px-4 text-center sm:px-6 lg:px-8">
          <div className="rounded-3xl bg-white p-10 shadow-2xl sm:p-12">
            <div className="relative mx-auto flex h-20 w-20 items-center justify-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-green-400/30" aria-hidden />
              <CheckCircle2 className="relative h-16 w-16 text-green-600 animate-fade-in" />
            </div>
            <h2 className="mt-6 text-2xl font-semibold text-slate-800 sm:text-3xl">
              Thank you for your interest!
            </h2>
            <p className="mt-4 text-base text-slate-500 sm:text-lg">
              We&apos;ll contact you within 24 hours to discuss your practice portal setup.
            </p>
            <Button className="mt-6" variant="outline" onClick={() => setSubmitted(false)}>
              Submit another inquiry
            </Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="join" className="relative overflow-hidden py-20 sm:py-24">
      <Image
        src="/marketing/join-bg.jpg"
        alt=""
        fill
        className="object-cover"
        sizes="100vw"
        aria-hidden
      />
      <div className="absolute inset-0 bg-[#0F4C81]/90" />
      <div
        className="pointer-events-none absolute -right-20 top-10 h-64 w-64 rounded-full bg-secondary/30 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-16 bottom-10 h-56 w-56 rounded-full bg-teal-300/20 blur-3xl"
        aria-hidden
      />

      <div className="relative mx-auto max-w-xl px-4 sm:px-6 lg:px-8">
        <SectionReveal>
          <div className="text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Ready to Modernize Your Practice?
            </h2>
            <p className="mt-4 text-base text-slate-100 sm:text-lg">
              Fill in your details below. Our team will contact you within 24 hours to set up your
              custom portal.
            </p>
          </div>
        </SectionReveal>

        <SectionReveal delayMs={100}>
          <div className="mt-10 rounded-3xl bg-white p-8 shadow-2xl sm:p-12">
            <div className="mb-6">
              <h3 className="text-xl font-semibold text-slate-800">Request My Practice Portal</h3>
              <p className="mt-1 text-sm text-slate-500">All fields marked * are required.</p>
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="full_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Dr. Sipho Ndamase"
                          className={inputFocusClass}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-5 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Address *</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="dr.ndamase@practice.co.za"
                            className={inputFocusClass}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number *</FormLabel>
                        <FormControl>
                          <Input
                            type="tel"
                            placeholder="+27 72 123 4567"
                            className={inputFocusClass}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="practice_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Practice Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Ndamase Family Practice"
                          className={inputFocusClass}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-5 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="hpcsa_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>HPCSA Registration Number *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="MP0123456"
                            className={`${inputFocusClass} uppercase`}
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Find your number at{' '}
                          <a
                            href="https://www.hpcsa.co.za"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-secondary underline-offset-2 hover:underline"
                          >
                            hpcsa.co.za
                          </a>
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="province"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Province *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className={inputFocusClass}>
                              <SelectValue placeholder="Select province" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {SA_PROVINCES.map((province) => (
                              <SelectItem key={province} value={province}>
                                {province}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>City / Town *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Port Elizabeth"
                          className={inputFocusClass}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="requested_subscription_plan"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Preferred Plan *</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={(value) => {
                            field.onChange(value);
                            onRequestedPlanChange?.(value as SubscriptionPlan);
                          }}
                          value={field.value}
                          className="space-y-2"
                        >
                          {SUBSCRIPTION_PLANS.map((plan) => (
                            <div key={plan.plan} className="flex items-center space-x-2">
                              <RadioGroupItem value={plan.plan} id={`plan-${plan.plan}`} />
                              <Label htmlFor={`plan-${plan.plan}`} className="font-normal">
                                {marketingPlanLabel(plan.plan)} — {marketingSeatDescription(plan.plan)}
                              </Label>
                            </div>
                          ))}
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="referral_source"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>How did you hear about us?</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ''}>
                        <FormControl>
                          <SelectTrigger className={inputFocusClass}>
                            <SelectValue placeholder="Select an option" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {REFERRAL_SOURCES.map((source) => (
                            <SelectItem key={source} value={source}>
                              {source}
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
                  name="message"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Message</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Tell us about your current challenges..."
                          className={`min-h-[100px] ${inputFocusClass}`}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  size="lg"
                  className="w-full bg-accent text-white transition-transform hover:scale-[1.02] hover:bg-accent/90 sm:w-auto sm:min-w-[240px]"
                  disabled={form.formState.isSubmitting}
                >
                  {form.formState.isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting…
                    </>
                  ) : (
                    'Request My Practice Portal'
                  )}
                </Button>

                <p className="text-center text-xs text-slate-500 sm:text-left">
                  Your information is secure and will only be used to create your practice account.
                  We handle inquiries with South African healthcare privacy requirements in mind.
                </p>
              </form>
            </Form>
          </div>
        </SectionReveal>
      </div>
    </section>
  );
}
