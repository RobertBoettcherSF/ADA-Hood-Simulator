with Hood.Random;

package body Hood.Population is

   ---------------------------------------------------------------------
   --  Names
   ---------------------------------------------------------------------

   function Part_Length (N : Integer_16) return Integer_32 is
     (if N < 0 then 0 else Hood.Tables.Name_Length (Integer_32 (N)));

   function Full_Name_Length (P : Person_Rec) return Integer_32 is
     (Part_Length (P.First) + 1 + Part_Length (P.Last)
      + (if P.Nick >= 0 then Part_Length (P.Nick) + 3 else 0));

   function Full_Name_Char (P : Person_Rec; Index : Integer_32) return Character is
      K : Integer_32 := Index;
      function Part (N : Integer_16; At_K : Integer_32) return Character is
        (Name_Text (Integer (Name_Start (Integer_32 (N)) + At_K - 1)));
      L : Integer_32;
   begin
      L := Part_Length (P.First);
      if K <= L then
         return Part (P.First, K);
      end if;
      K := K - L;
      if K = 1 then
         return ' ';
      end if;
      K := K - 1;
      if P.Nick >= 0 then
         L := Part_Length (P.Nick);
         if K = 1 or else K = L + 2 then
            return '"';
         elsif K <= L + 1 then
            return Part (P.Nick, K - 1);
         elsif K = L + 3 then
            return ' ';
         end if;
         K := K - (L + 3);
      end if;
      return Part (P.Last, K);
   end Full_Name_Char;

   ---------------------------------------------------------------------
   --  Attitudes
   ---------------------------------------------------------------------

   Hostility_Salt : constant := 16#4A7C#;
   Fear_Salt      : constant := 16#51ED#;

   function Mix (A, B, Salt : Unsigned_32) return Unsigned_32 is
     (Hood.Random.Hash32
        ((A xor 16#9E37_79B9#) * 16#85EB_CA6B# xor (B + Salt) * 16#C2B2_AE35#));

   function Clamp_Byte (V : Integer_32) return Integer_32 is
     (Integer_32'Max (0, Integer_32'Min (255, V)));

   function Roll (Id : Integer_32; Gang : Gang_Id; Salt : Unsigned_32;
                  Base, Span : Integer_32) return Integer_32 is
     (Base + Integer_32 (Mix (Unsigned_32 (Id), Unsigned_32 (Gang), Salt)
                         mod Unsigned_32 (Span)));

   function Rolled_Hostility (Id : Integer_32; Kind : Role; Gang : Gang_Id) return Integer_32 is
      K : constant Attitude_Class := Role_Class (Kind);
   begin
      return Clamp_Byte (Roll (Id, Gang, Hostility_Salt, Hostility_Base (K), Hostility_Range (K)));
   end Rolled_Hostility;

   function Rolled_Fear (Id : Integer_32; Kind : Role; Gang : Gang_Id) return Integer_32 is
      K : constant Attitude_Class := Role_Class (Kind);
      R : constant Integer_32 := Roll (Id, Gang, Fear_Salt, Fear_Base (K), Fear_Range (K));
   begin
      if Fear_Adds_Hostility (K) then
         return Clamp_Byte (R + Rolled_Hostility (Id, Kind, Gang));
      end if;
      return Clamp_Byte (R);
   end Rolled_Fear;

   function Hostility_Of (P : Person_Rec; Gang : Gang_Id) return Integer_32 is
     (if P.Gang = Gang and then P.Hostility >= 0 then Integer_32 (P.Hostility)
      else Rolled_Hostility (P.Id, P.Kind, Gang));

   function Fear_Of (P : Person_Rec; Gang : Gang_Id) return Integer_32 is
     (if P.Gang = Gang and then P.Fear >= 0 then Integer_32 (P.Fear)
      else Rolled_Fear (P.Id, P.Kind, Gang));

   ---------------------------------------------------------------------
   --  Wages
   ---------------------------------------------------------------------

   Int_Bands   : constant array (Integer_32 range 0 .. 9) of Integer_32 :=
     [12, 38, 63, 88, 113, 138, 163, 188, 213, 241];
   Skill_Bands : constant array (Integer_32 range 0 .. 9) of Integer_32 :=
     [2, 8, 16, 24, 30, 34, 38, 46, 54, 60];

   function Skill_Byte (P : Person_Rec; S : Skill) return Integer_32 is
      I : constant Integer_32 := Integer_32'Max (0, Integer_32'Min (9, Integer_32 (P.Skills (S)) - 1));
   begin
      return (if S = Intelligence then Int_Bands (I) else Skill_Bands (I));
   end Skill_Byte;

   function Wage_Quote (P : Person_Rec; Gang : Gang_Id) return Integer_32 is
      Int        : constant Integer_32 := Skill_Byte (P, Intelligence);
      Specialist : constant Boolean := P.Kind in R_Accountant | R_Lawyer;
      Sum, Best, Stars, Average, V : Integer_32;
      Base       : constant Integer_32 :=
        (if P.Kind in R_Accountant | R_Lawyer | R_Lieutenant then 100 else 50);
   begin
      if Specialist then
         Average := Int / 4;
         Best := Int / 4;
         Stars := 0;
      else
         Sum := Int / 4;
         Best := Int / 4;
         Stars := 0;
         for S in Organization .. Skill'Last loop
            V := Skill_Byte (P, S);
            Sum := Sum + V;
            Best := Integer_32'Max (Best, V);
            if V > 52 then
               Stars := Stars + 1;
            end if;
         end loop;
         Average := Sum / 11;
      end if;
      --  Ada's "/" truncates toward zero, as Math.trunc.
      return Base + (Best - Fear_Of (P, Gang) + Hostility_Of (P, Gang) + Int + Average) / 4
        + 10 * Stars;
   end Wage_Quote;

   --  Long_Float'Floor would call a runtime routine the WebAssembly
   --  build lacks: round to the nearest whole number, then step down.
   function Floor_Of (V : Long_Float) return Long_Float is
      I : Integer_64 := Integer_64 (V);
   begin
      if Long_Float (I) > V then
         I := I - 1;
      end if;
      return Long_Float (I);
   end Floor_Of;

   function Round_Half_Up (V : Long_Float) return Long_Float is
      F : constant Long_Float := Floor_Of (V);
   begin
      return (if V - F >= 0.5 then F + 1.0 else F);
   end Round_Half_Up;

   function Pay_Demand (P : Person_Rec; As : Role) return Integer_32 is
      Halves : Integer_32 := 0;
      Avg, Base : Long_Float;
   begin
      for S in Skill loop
         Halves := Halves + Integer_32 (P.Skills (S));
      end loop;
      Avg := (Long_Float (Halves) / 2.0) / 11.0;
      Base := 30.0 + Avg * 26.0;
      if As = R_Lieutenant then
         Base := Base + 50.0;
      end if;
      if As in R_Accountant | R_Lawyer then
         Base := 90.0 + Avg * 44.0;
      end if;
      return Integer_32 (Round_Half_Up (Base / 5.0)) * 5;
   end Pay_Demand;

   ---------------------------------------------------------------------
   --  Hashes
   ---------------------------------------------------------------------

   procedure Add (H : in out Unsigned_32; V : Integer_32) is
      U : constant Unsigned_32 := Unsigned_32 (Integer_64 (V) mod 2**32);
   begin
      for Byte in 0 .. 3 loop
         H := (H xor (Shift_Right (U, 8 * Byte) and 16#FF#)) * 16#0100_0193#;
      end loop;
   end Add;

   procedure Add_Byte (H : in out Unsigned_32; V : Integer_32) is
   begin
      H := (H xor Unsigned_32 (V mod 256)) * 16#0100_0193#;
   end Add_Byte;

   Rank : array (Integer_32 range 0 .. Hood.City.Max_Buildings - 1) of Integer_32;

   function People_Hash (S : Population_State; C : Hood.City.City_State) return Unsigned_32 is
      H : Unsigned_32 := 16#811C_9DC5#;
      N : Integer_32 := 0;
   begin
      for B in Integer_32 range 0 .. C.Building_Count - 1 loop
         if C.Buildings (B).Removed then
            Rank (B) := -2;
         else
            Rank (B) := N;
            N := N + 1;
         end if;
      end loop;
      for I in Integer_32 range 0 .. S.Count - 1 loop
         declare
            P : Person_Rec renames S.People (I);
         begin
            Add (H, P.Id);
            Add (H, Role'Pos (P.Kind));
            Add (H, (if P.Gang = 0 then -1 else P.Gang));
            Add (H, Boolean'Pos (P.Female));
            Add (H, Integer_32 (P.Portrait));
            for K in Skill loop
               Add (H, Integer_32 (P.Skills (K)));
            end loop;
            Add (H, P.Pay);
            Add (H, P.Demand);
            Add (H, P.Loyalty);
            Add (H, P.Team);
            Add (H, (if P.Building = No_Id then -1 else Rank (P.Building)));
         end;
      end loop;
      return H;
   end People_Hash;

   function Position_Hash (S : Population_State) return Unsigned_32 is
      H : Unsigned_32 := 16#811C_9DC5#;
   begin
      for I in Integer_32 range 0 .. S.Count - 1 loop
         Add (H, S.People (I).Id);
         Add (H, Integer_32 (S.People (I).X));
         Add (H, Integer_32 (S.People (I).Y));
      end loop;
      return H;
   end Position_Hash;

   function Opinion_Hash (S : Population_State) return Unsigned_32 is
      H : Unsigned_32 := 16#811C_9DC5#;
   begin
      for I in Integer_32 range 0 .. S.Count - 1 loop
         Add (H, S.People (I).Id);
         for G in Gang_Id loop
            Add (H, Integer_32 (S.People (I).Opinion (G)));
         end loop;
      end loop;
      return H;
   end Opinion_Hash;

   function Name_Hash (S : Population_State) return Unsigned_32 is
      H : Unsigned_32 := 16#811C_9DC5#;
      L : Integer_32;
   begin
      for I in Integer_32 range 0 .. S.Count - 1 loop
         declare
            P : Person_Rec renames S.People (I);
         begin
            Add (H, P.Id);
            L := Full_Name_Length (P);
            Add (H, L);
            for K in Integer_32 range 1 .. L loop
               Add_Byte (H, Character'Pos (Full_Name_Char (P, K)));
            end loop;
         end;
      end loop;
      return H;
   end Name_Hash;

   ---------------------------------------------------------------------
   --  Places
   ---------------------------------------------------------------------

   procedure Pavement (B : Hood.City.Block_Rec; N : Integer_32; X, Y : out Hood.Units.Units) is
      RX : constant Long_Float := Long_Float (Block_Rect_X (B));
      RY : constant Long_Float := Long_Float (Block_Rect_Y (B));
      RW : constant Long_Float := Long_Float (Block_Rect_W (B));
      RH : constant Long_Float := Long_Float (Block_Rect_H (B));
      Side  : constant Integer_32 := N mod 4;
      Along : constant Long_Float := Long_Float ((Integer_64 (N) * 13) mod 41) / 40.0;
      Kerb  : constant Long_Float := 1.6;
   begin
      if Side = 0 or else Side = 2 then
         X := Hood.City.To_Units (RX + Along * RW);
         Y := Hood.City.To_Units (RY + (if Side = 0 then -Kerb else RH + Kerb));
      else
         X := Hood.City.To_Units (RX + (if Side = 1 then RW + Kerb else -Kerb));
         Y := Hood.City.To_Units (RY + Along * RH);
      end if;
   end Pavement;

   function Block_At (C : Hood.City.City_State; GX, GY : Integer_32) return Integer_32 is
      B : Integer_32;
   begin
      if GX < 0 or else GY < 0 or else GX >= C.W or else GY >= C.H then
         return No_Id;
      end if;
      B := GY * C.W + GX;
      if B >= C.Block_Count then
         return No_Id;
      end if;
      if C.Blocks (B).Merged_Into /= No_Id then
         return C.Blocks (B).Merged_Into;
      end if;
      return B;
   end Block_At;

   function Has_Footway (C : Hood.City.City_State; B : Integer_32) return Boolean is
     (C.Blocks (B).Use_Of not in Hood.City.Water | Hood.City.Avenue);

   procedure Count_Trading (S : in out Population_State; C : Hood.City.City_State) is
      L, N : Integer_32;
   begin
      for B in Integer_32 range 0 .. C.Block_Count - 1 loop
         N := 0;
         for K in Integer_32 range 0 .. C.Blocks (B).Lots - 1 loop
            L := C.Blocks (B).First_Lot + K;
            if Live (C, C.Lots (L).Building)
              and then Class_Of (C, C.Lots (L).Building) /= Empty
            then
               N := N + 1;
            end if;
         end loop;
         S.Trading (B) := N;
      end loop;
   end Count_Trading;

end Hood.Population;
