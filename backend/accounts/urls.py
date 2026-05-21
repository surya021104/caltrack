from django.urls import path

from .views import (
    LoginView, MeView, RefreshView, LogoutView,
    GoogleLoginView, RegisterView,
    ProfileUpdateView, PasswordChangeView, EmailChangeView, TwoFactorSetupView,
    AcceptInviteView, PasswordResetRequestView, PasswordResetConfirmView
)

urlpatterns = [
    path("login/",          LoginView.as_view(),         name="jwt-login"),
    path("register/",       RegisterView.as_view(),       name="jwt-register"),
    path("google/",         GoogleLoginView.as_view(),    name="google-login"),
    path("refresh/",        RefreshView.as_view(),        name="jwt-refresh"),
    path("logout/",         LogoutView.as_view(),         name="jwt-logout"),
    path("me/",             MeView.as_view(),             name="me"),
    path("profile/",        ProfileUpdateView.as_view(),  name="profile-update"),
    path("password/change/",PasswordChangeView.as_view(), name="password-change"),
    path("email/change/",   EmailChangeView.as_view(),    name="email-change"),
    path("2fa/",            TwoFactorSetupView.as_view(), name="2fa-setup"),
    path("login/", LoginView.as_view(), name="jwt-login"),
    path("register/", RegisterView.as_view(), name="jwt-register"),
    path("google/", GoogleLoginView.as_view(), name="google-login"),
    path("password-reset/request/", PasswordResetRequestView.as_view(), name="password-reset-request"),
    path("password-reset/confirm/", PasswordResetConfirmView.as_view(), name="password-reset-confirm"),
    path("refresh/", RefreshView.as_view(), name="jwt-refresh"),
    path("me/", MeView.as_view(), name="me"),
    path("profile/", ProfileUpdateView.as_view(), name="profile-update"),
    path("password/change/", PasswordChangeView.as_view(), name="password-change"),
    path("email/change/", EmailChangeView.as_view(), name="email-change"),
    path("2fa/", TwoFactorSetupView.as_view(), name="2fa-setup"),
    path("accept-invite/", AcceptInviteView.as_view(), name="accept-invite"),
]
