import { RouteSurface } from '@/routing/route-surface';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { GraduationCap, ArrowRight, X } from 'lucide-react';
import { authClient } from '@/lib/api';
import { authFormSchema } from '@/lib/form-schemas';
import { clearPrivateQueries } from '@/lib/query';
import { Modal } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormMessage } from '@/components/ui/form-message';
type AuthValues = { name: string; email: string; password: string };
export function AuthDialog({
  onClose,
  onSuccess,
  standalone = false,
}: {
  onClose: () => void;
  onSuccess: () => void;
  standalone?: boolean;
}) {
  const Surface = standalone ? RouteSurface : Modal;
  const [signup, setSignup] = useState(false);
  const client = useQueryClient();
  const form = useForm<AuthValues>({
    resolver: zodResolver(authFormSchema(signup)),
    defaultValues: { name: '', email: '', password: '' },
    mode: 'onBlur',
  });
  const mutation = useMutation({
    mutationFn: async (values: AuthValues) => {
      const result = signup
        ? await authClient.signUp.email({ ...values, name: values.name.trim() })
        : await authClient.signIn.email({ email: values.email, password: values.password });
      if (result.error) throw new Error(result.error.message);
    },
    onSuccess: async () => {
      await clearPrivateQueries(client);
      onSuccess();
    },
    onError: (error) => form.setError('root', { message: error.message }),
  });
  return (
    <Surface
      className={standalone ? 'auth-route' : undefined}
      title={signup ? 'Create an account' : 'Log in'}
      onClose={() => {
        if (!mutation.isPending) onClose();
      }}
    >
      <button
        className="modal-close"
        aria-label="Close"
        disabled={mutation.isPending}
        onClick={onClose}
      >
        <X />
      </button>
      <GraduationCap className="modal-icon" size={34} />
      <h2>{signup ? 'Your journey starts here.' : 'Welcome back.'}</h2>
      <p className="muted">
        {signup
          ? 'Create an account and follow your curiosity.'
          : 'A new skill is just a lesson away.'}
      </p>
      <form
        className="auth-form"
        noValidate
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
      >
        <fieldset disabled={mutation.isPending} className="form-fields">
          {signup && (
            <label htmlFor="auth-name">
              Your name
              <Input
                id="auth-name"
                autoComplete="name"
                aria-invalid={!!form.formState.errors.name}
                aria-describedby="auth-name-error"
                {...form.register('name')}
              />
              <FormMessage id="auth-name-error" message={form.formState.errors.name?.message} />
            </label>
          )}
          <label htmlFor="auth-email">
            Email address
            <Input
              id="auth-email"
              type="email"
              autoComplete="email"
              aria-invalid={!!form.formState.errors.email}
              aria-describedby="auth-email-error"
              {...form.register('email')}
            />
            <FormMessage id="auth-email-error" message={form.formState.errors.email?.message} />
          </label>
          <label htmlFor="auth-password">
            Password
            <Input
              id="auth-password"
              type="password"
              autoComplete={signup ? 'new-password' : 'current-password'}
              aria-invalid={!!form.formState.errors.password}
              aria-describedby="auth-password-error"
              {...form.register('password')}
            />
            <FormMessage
              id="auth-password-error"
              message={form.formState.errors.password?.message}
            />
          </label>
        </fieldset>
        <FormMessage message={form.formState.errors.root?.message} />
        <Button disabled={mutation.isPending} className="w-full">
          {mutation.isPending ? 'Please wait…' : signup ? 'Create account' : 'Log in'}
          <ArrowRight size={16} />
        </Button>
      </form>
      <button
        disabled={mutation.isPending}
        className="auth-switch"
        onClick={() => {
          setSignup((value) => !value);
          form.reset({ name: '', email: '', password: '' });
          mutation.reset();
        }}
      >
        {signup ? 'Already have an account? Log in' : 'New to Learnly? Create an account'}
      </button>
    </Surface>
  );
}
