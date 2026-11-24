with Hood.Population.Crews;
package body Hood.Population.Setup is

   use Hood.Random;

   ---------------------------------------------------------------------
   --  Draws
   ---------------------------------------------------------------------

   function Int (G : in out Mulberry; Min, Max : Integer_32) return Integer_32 is
      V : Integer_32;
   begin
      Hood.Random.Int (G, Min, Max, V);
      return V;
   end Int;

   function Pick (G : in out Mulberry; Length : Integer_32) return Integer_32 is
      V : Integer_32;
   begin
      Pick_Index (G, Length, V);
      return V;
   end Pick;

   function Chance (G : in out Mulberry; Num, Den : Unsigned_32) return Boolean is
      R : Boolean;
   begin
      Hood.Random.Chance (G, Num, Den, R);
      return R;
   end Chance;

   function Unit (G : in out Mulberry) return Long_Float is
      U : Unsigned_32;
   begin
      Next (G, U);
      return Long_Float (U) / 4_294_967_296.0;
   end Unit;

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

   ---------------------------------------------------------------------
   --  Skills
   ---------------------------------------------------------------------

   --  rng.bell (0.5, 5.2) * quality to half stars (citygen.ts:73-80).
   procedure Make_Skills (G : in out Mulberry; Quality : Long_Float; Set : out Skill_Set) is
      Low  : constant Long_Float := 0.5;
      High : constant Long_Float := 5.2;
      A, B, D, T, Raw : Long_Float;
      Halves : Long_Float;
   begin
      for K in Skill loop
         A := Unit (G);
         B := Unit (G);
         D := Unit (G);
         T := (A + B + D) / 3.0;
         Raw := (Low + T * (High - Low)) * Quality;
         Halves := Round_Half_Up (Raw * 2.0);
         Set (K) := Integer_8 (Long_Float'Max (1.0, Long_Float'Min (10.0, Halves)));
      end loop;
   end Make_Skills;

   Int_Bands   : constant array (Integer_32 range 0 .. 9) of Integer_32 :=
     [12, 38, 63, 88, 113, 138, 163, 188, 213, 241];
   Skill_Bands : constant array (Integer_32 range 0 .. 9) of Integer_32 :=
     [2, 8, 16, 24, 30, 34, 38, 46, 54, 60];

   --  A hood from the 18 hood types (hoodGeneration.ts:59-86): the type by
   --  weight, then a byte per skill, read as the nearest star band.
   procedure Hood_Skills (G : in out Mulberry; Business : Boolean; Set : out Skill_Set) is
      Total, Sum, Pick_T, Byte, Best, Top : Integer_32;
      U : Unsigned_32;
   begin
      Total := 0;
      for T in Hood_Type loop
         if not Business or else Hood_Business (T) then
            Total := Total + Hood_Weight (T);
         end if;
      end loop;
      Next (G, U);
      Sum := 0;
      Pick_T := Hood_Type'Last;
      for T in Hood_Type loop
         if not Business or else Hood_Business (T) then
            Pick_T := T;
            Sum := Sum + Hood_Weight (T);
            exit when Unsigned_64 (U) * Unsigned_64 (Total) < Shift_Left (Unsigned_64 (Sum), 32);
         end if;
      end loop;
      for K in Skill loop
         Top := (if K = Intelligence then 255 else 63);
         Byte := Hood_Base (Pick_T) (K);
         if Hood_Range (Pick_T) (K) > 0 then
            Byte := Byte + Int (G, 0, Hood_Range (Pick_T) (K) - 1);
         end if;
         Byte := Integer_32'Min (Top, Byte);
         Best := 0;
         for I in Integer_32 range 1 .. 9 loop
            if K = Intelligence then
               if abs (Int_Bands (I) - Byte) < abs (Int_Bands (Best) - Byte) then
                  Best := I;
               end if;
            elsif abs (Skill_Bands (I) - Byte) < abs (Skill_Bands (Best) - Byte) then
               Best := I;
            end if;
         end loop;
         Set (K) := Integer_8 (Best + 1);
      end loop;
   end Hood_Skills;

   ---------------------------------------------------------------------
   --  People
   ---------------------------------------------------------------------

   procedure Create
     (S        : in out Population_State;
      Main     : in out Hood.Random.Mulberry;
      Kind     : Role;
      X, Y     : Long_Float;
      Index    : out Integer_32;
      Female   : Integer_32 := -1;
      Origin   : Integer_32 := -1;
      Prefer   : Integer_32 := -1;
      First    : Integer_32 := No_Name;
      Last     : Integer_32 := No_Name;
      Nick     : Integer_32 := No_Name;
      Portrait : Integer_32 := -1;
      Quality  : Long_Float := 1.0;
      Business : Boolean := False;
      Gang     : Gang_Ref := 0;
      Building : Integer_32 := No_Id)
   is
      Is_Female : Boolean;
      F, L, H, Slot, NF, NS : Integer_32;
      Weights : Weight_List (1 .. Heritage_Count);
      Picked  : Positive;
   begin
      if S.Count = Max_People then
         S.Status := Status_Full;
         Index := No_Id;
         return;
      end if;
      --  Sex: hoods one in 4.5 women, everyone else two in five.
      if Female >= 0 then
         Is_Female := Female = 1;
      elsif Kind = R_Hood then
         Is_Female := Chance (Main, 11, 50);
      else
         Is_Female := Chance (Main, 2, 5);
      end if;
      --  Names (citygen.ts:88-93, heritage.ts:69-92).
      if First /= No_Name then
         F := First;
         L := Last;
      elsif Origin >= 0 then
         if Is_Female then
            F := Heritage_Female_First (Origin) + Pick (Main, Heritage_Female_Count (Origin));
         else
            F := Heritage_Male_First (Origin) + Pick (Main, Heritage_Male_Count (Origin));
         end if;
         L := Heritage_Surname_First (Origin) + Pick (Main, Heritage_Surname_Count (Origin));
      elsif Prefer >= 0 then
         for I in Weights'Range loop
            Weights (I) := (if Integer_32 (I) - 1 = Prefer then 12 else 1);
         end loop;
         Weighted (Main, Weights, Picked);
         H := Integer_32 (Picked) - 1;
         NF := (if Is_Female then Heritage_Female_Count (H) else Heritage_Male_Count (H));
         NS := Heritage_Surname_Count (H);
         Slot := Int (Main, 0, NF * NS - 1);
         F := (if Is_Female then Heritage_Female_First (H) else Heritage_Male_First (H)) + Slot mod NF;
         L := Heritage_Surname_First (H) + Slot / NF;
      else
         if Is_Female then
            F := Pool_First (Female_First) + Pick (Main, Pool_Length (Female_First));
         else
            F := Pool_First (Male_First) + Pick (Main, Pool_Length (Male_First));
         end if;
         L := Pool_First (Surnames) + Pick (Main, Pool_Length (Surnames));
      end if;
      Index := S.Count;
      S.Count := S.Count + 1;
      declare
         P : Person_Rec renames S.People (Index);
      begin
         P.Id := S.Next_Id;
         S.Next_Id := S.Next_Id + 1;
         P.Kind := Kind;
         P.Status := Active;
         P.Female := Is_Female;
         P.First := Integer_16 (F);
         P.Last := Integer_16 (L);
         P.Nick := Integer_16 (Nick);
         P.Portrait := Integer_8 (if Portrait >= 0 then Portrait else Int (Main, 0, 23));
         if Kind = R_Hood then
            Hood_Skills (Main, Business, P.Skills);
         else
            Make_Skills (Main, Quality, P.Skills);
         end if;
         P.Gang := Gang;
         P.Team := No_Id;
         P.Building := Building;
         P.Pay := 0;
         P.Demand := 0;
         P.Loyalty := Loyalty_Start;
         P.Hostility := -1;
         P.Fear := -1;
         P.Opinion := [others => 0];
         P.X := X;
         P.Y := Y;
         P.DX := X;
         P.DY := Y;
         P.Walking := False;
         P.Halted := False;
         P.Path_Head := No_Id;
         P.Path_Off := 0;
         P.Path_Len := 0;
         P.Order := No_Id;
         P.In_Vehicle := False;
         P.Vehicle := No_Id;
      end;
   end Create;

   ---------------------------------------------------------------------
   --  Hiring places
   ---------------------------------------------------------------------

   Present : array (Integer_32 range 0 .. Hood.City.Max_Buildings - 1) of Integer_32;
   Max_Idle : constant := 256;
   Idle : array (1 .. Max_Idle) of Integer_32;

   function Quota_Of (C : Hood.City.City_State; B : Integer_32) return Integer_32 is
   begin
      for Q in Quota_Id loop
         if Quota_Type (Q) = C.Buildings (B).Kind_Of then
            return Q;
         end if;
      end loop;
      return -1;
   end Quota_Of;

   procedure Top_Up
     (S    : in out Population_State;
      C    : Hood.City.City_State;
      Main : in out Hood.Random.Mulberry)
   is
      Want_Business : Boolean := True;
      Idle_Count : Integer := 0;
      Q, N, Need, Best, Index : Integer_32;
      LX, LY : Long_Float;
      Best_D, D : Long_Float;
   begin
      for B in Integer_32 range 0 .. C.Building_Count - 1 loop
         Present (B) := 0;
      end loop;
      for I in Integer_32 range 0 .. S.Count - 1 loop
         declare
            P : Person_Rec renames S.People (I);
         begin
            if P.Gang = 0 and then P.Status = Active then
               if P.Building /= No_Id then
                  Q := Quota_Of (C, P.Building);
                  if Q >= 0 and then Quota_Role (Q) = P.Kind then
                     Present (P.Building) := Present (P.Building) + 1;
                  end if;
                  if P.Kind = R_Hood and then P.Skills (Business) >= 5 then
                     Want_Business := False;  --  a business hood is already free
                  end if;
               elsif P.Kind in R_Hood | R_Accountant | R_Lawyer and then Idle_Count < Max_Idle then
                  Idle_Count := Idle_Count + 1;
                  Idle (Idle_Count) := I;
               end if;
            end if;
         end;
      end loop;
      for B in Integer_32 range 0 .. C.Building_Count - 1 loop
         if Live (C, B) and then Class_Of (C, B) /= Empty then
            Q := Quota_Of (C, B);
            if Q >= 0 then
               N := Present (B);
               Need := Quota_People (Q);
               LX := C.Lots (C.Buildings (B).Lot).CX;
               LY := C.Lots (C.Buildings (B).Lot).CY;
               if N < Need then
                  --  One idle man of the kind, the nearest, moves here.
                  Best := 0;
                  Best_D := 0.0;
                  for K in 1 .. Idle_Count loop
                     if Idle (K) /= No_Id and then S.People (Idle (K)).Kind = Quota_Role (Q) then
                        D := (S.People (Idle (K)).X - LX) ** 2 + (S.People (Idle (K)).Y - LY) ** 2;
                        if Best = 0 or else D < Best_D then
                           Best := Integer_32 (K);
                           Best_D := D;
                        end if;
                     end if;
                  end loop;
                  if Best > 0 then
                     declare
                        P : Person_Rec renames S.People (Idle (Integer (Best)));
                     begin
                        P.Building := B;
                        P.X := LX;
                        P.Y := LY;
                        P.Walking := False;
                     end;
                     Idle (Integer (Best)) := No_Id;
                     N := N + 1;
                  end if;
               end if;
               while N < Need loop
                  Create (S, Main, Quota_Role (Q), LX, LY, Index,
                          Prefer   => Player_Heritage,
                          Quality  => 1.1,
                          Business => Quota_Role (Q) = R_Hood and then Want_Business,
                          Building => B);
                  exit when Index = No_Id;
                  if Quota_Role (Q) = R_Hood then
                     Want_Business := False;
                  end if;
                  S.People (Index).Demand := Pay_Demand (S.People (Index), Quota_Role (Q));
                  N := N + 1;
               end loop;
            end if;
         end if;
      end loop;
   end Top_Up;

   ---------------------------------------------------------------------
   --  The city's people
   ---------------------------------------------------------------------

   Street : array (Integer_32 range 0 .. Hood.City.Max_Blocks - 1) of Integer_32;
   Civic  : array (Integer_32 range 0 .. Hood.City.Max_Blocks - 1) of Integer_32;
   Taken  : Hood.City.Building_Flags;

   --  The four gangs (citygen.ts:609-912).

   procedure Gangs
     (S    : in out Population_State;
      C    : in out Hood.City.City_State;
      Main : in out Hood.Random.Mulberry)
   is
      Colours  : Index_List (1 .. 3) := [1, 2, 3];          --  green, blue, orange
      Quarters : Index_List (1 .. 4) := [0, 1, 2, 3];
      Names    : Index_List (1 .. Integer (Pool_Length (Gang_Surnames)));
      Half_W   : constant Integer_32 := C.W / 2;
      Half_H   : constant Integer_32 := C.H / 2;
      Centre   : constant := 4;  --  the centre lot of a block

      Choice   : Index_List (1 .. Max_Sites);

      function In_Quarter (Q, Block : Integer_32) return Boolean is
         GX : constant Integer_32 := C.Blocks (Block).GX;
         GY : constant Integer_32 := C.Blocks (Block).GY;
      begin
         return (case Q is
                    when 0 => GX < Half_W and then GY < Half_H,
                    when 1 => GX >= Half_W and then GY < Half_H,
                    when 2 => GX < Half_W and then GY >= Half_H,
                    when others => GX >= Half_W and then GY >= Half_H);
      end In_Quarter;

      function Legal_Front (Lot : Integer_32) return Boolean is
         B : constant Integer_32 := C.Lots (Lot).Building;
      begin
         return C.Lots (Lot).Index /= Centre
           and then Live (C, B)
           and then Class_Of (C, B) in Commercial | Industrial | Tenement | Charity;
      end Legal_Front;

      function Office_Block (Block : Integer_32) return Boolean is
         Has_Centre, Has_Front : Boolean := False;
         L : Integer_32;
      begin
         for K in Integer_32 range 0 .. C.Blocks (Block).Lots - 1 loop
            L := C.Blocks (Block).First_Lot + K;
            Has_Centre := Has_Centre or else C.Lots (L).Index = Centre;
            Has_Front := Has_Front or else Legal_Front (L);
         end loop;
         if not (Has_Centre and then Has_Front) then
            return False;
         end if;
         for G in Gang_Id loop
            if S.Gangs (G).Office /= No_Id and then C.Buildings (S.Gangs (G).Office).Block = Block then
               return False;
            end if;
         end loop;
         return True;
      end Office_Block;

      procedure Protect (B : Integer_32; G : Gang_Id) is
         Profit : constant Long_Float := Long_Float (Type_Profit (C.Buildings (B).Kind_Of));
      begin
         S.Extra (B).Protect_Gang := G;
         S.Extra (B).Protect_Weekly :=
           Integer_32 (Round_Half_Up (Long_Float'Max (60.0, Profit * 0.4)));
         S.Extra (B).Protect_Base := S.Extra (B).Protect_Weekly;
      end Protect;

      procedure Join_Pool (G : Gang_Id; P : Integer_32) is
      begin
         if S.Gangs (G).Pool_Count < Max_Pool then
            S.Gangs (G).Pool_Count := S.Gangs (G).Pool_Count + 1;
            S.Gangs (G).Pool (Integer (S.Gangs (G).Pool_Count)) := P;
         end if;
      end Join_Pool;

      Block, Front_Lot, Centre_Lot, Office, Front, Boss, L, Index, Count, Twin, Crew : Integer_32;
      Hoods : array (1 .. 6) of Integer_32;
      Is_Female : Boolean;
      Heritage : Heritage_Id;
      First_Name, Nick : Integer_32;
      Hostility : Integer_32;
      Sixty : Hood.City.Starting_Site_List;
   begin
      for K in Names'Range loop
         Names (K) := Integer_32 (K) - 1;
      end loop;
      Shuffle (Main, Colours);
      Shuffle (Main, Quarters);
      Shuffle (Main, Names);
      --  The player's gang carries his surname, and no rival shares it.
      Twin := 0;
      for K in Names'First + 1 .. Names'Last loop
         if Twin = 0 and then Names (K) = Player_Gang_Surname then
            Twin := Integer_32 (K);
         end if;
      end loop;
      if Twin > 0 then
         Names (Integer (Twin)) := Names (Names'First);
      end if;

      for G in Gang_Id loop
         S.Gangs (G) :=
           (Colour => (if G = 1 then 0 else Colours (Integer (G) - 1)),
            Surname => (if G = 1 then Player_Last
                        else Pool_First (Gang_Surnames) + Names (Integer (G))),
            Heritage => (if G = 1 then Player_Heritage
                         else Gang_Surname_Heritage (Names (Integer (G)))),
            Player => G = 1, Profile => -1,
            Boss | Office | Front | Manager => No_Id,
            Cash => 6_000, Crew_Total | Pool_Count | Site_Count | Wages => 0,
            Purchases | Protection | Last_Purchases | Last_Protection => 0,
            Crews => [others => No_Id],
            Pool => [others => No_Id], Sites => [others => No_Id],
            Pistols => 2, Coupes => 1, Speedsters | Trucks => 0,
            Offered | Known => [others => Peace], Eliminated => False);
      end loop;

      --  The Standard city's fronts become their new trades first
      --  (1.2.91 gang bootstrap).
      if C.Standard then
         for G in Gang_Id loop
            Front := C.HQ (G).Front;
            C.Buildings (Front).Kind_Of := Kind_Type (C.HQ (G).Front_As);
            C.Buildings (Front).Trade := C.HQ (G).Front_As;
         end loop;
      end if;

      for G in Gang_Id loop
         declare
            Gang : Gang_Rec renames S.Gangs (G);
            Q    : constant Integer_32 := Quarters (Integer (G));
            N    : Integer_32 := 0;
            Any  : Integer_32 := 0;
         begin
            --  Headquarters block: the Standard city's own sites; elsewhere a
            --  block of the gang's quarter with a free centre lot and a front.
            if C.Standard then
               Block := C.HQ (G).Block;
            else
               for K in Integer_32 range 0 .. C.Block_Count - 1 loop
                  if Office_Block (K) then
                     Any := Any + 1;
                     if In_Quarter (Q, K)
                       and then C.Blocks (K).Area in Hood.Tables.Commercial | Hood.Tables.Residential
                     then
                        N := N + 1;
                     end if;
                  end if;
               end loop;
               Index := Pick (Main, (if N > 0 then N else Any));
               Block := No_Id;
               for K in Integer_32 range 0 .. C.Block_Count - 1 loop
                  if Block = No_Id and then Office_Block (K)
                    and then (N = 0 or else
                                (In_Quarter (Q, K)
                                 and then C.Blocks (K).Area in Hood.Tables.Commercial | Hood.Tables.Residential))
                  then
                     if Index = 0 then
                        Block := K;
                     end if;
                     Index := Index - 1;
                  end if;
               end loop;
            end if;

            --  The boss.
            if Gang.Player then
               Is_Female := False;
               Create (S, Main, R_Boss, Long_Float (C.Blocks (Block).Center_X) / 256.0, Long_Float (C.Blocks (Block).Center_Y) / 256.0, Boss,
                       Female => 0, First => Player_First, Last => Player_Last, Portrait => 0,
                       Quality => 1.3, Gang => G);
            else
               Is_Female := Chance (Main, 1, 5);
               Heritage := Gang.Heritage;
               if Is_Female then
                  First_Name := Heritage_Female_First (Heritage) + Pick (Main, Heritage_Female_Count (Heritage));
               else
                  First_Name := Heritage_Male_First (Heritage) + Pick (Main, Heritage_Male_Count (Heritage));
               end if;
               Nick := Pool_First (Nicknames) + Pick (Main, Pool_Length (Nicknames));
               Index := Int (Main, 0, 23);
               Create (S, Main, R_Boss, Long_Float (C.Blocks (Block).Center_X) / 256.0, Long_Float (C.Blocks (Block).Center_Y) / 256.0, Boss,
                       Female => Boolean'Pos (Is_Female), First => First_Name, Last => Gang.Surname,
                       Nick => Nick, Portrait => Index, Quality => 1.3, Gang => G);
               --  A Normal rival's profile: rows 8 .. 15 (aiStance.ts:95-99).
               Gang.Profile := 8 + Int (Main, 0, 7);
            end if;
            exit when Boss = No_Id;
            Gang.Boss := Boss;

            --  The front on an edge lot and the office in the centre lot.
            if C.Standard then
               Front_Lot := C.Buildings (C.HQ (G).Front).Lot;
            else
               Count := 0;
               for K in Integer_32 range 0 .. C.Blocks (Block).Lots - 1 loop
                  if C.Lots (C.Blocks (Block).First_Lot + K).Index /= Centre then
                     Count := Count + 1;
                  end if;
               end loop;
               Index := Pick (Main, Count);
               Front_Lot := No_Id;
               for K in Integer_32 range 0 .. C.Blocks (Block).Lots - 1 loop
                  L := C.Blocks (Block).First_Lot + K;
                  if C.Lots (L).Index /= Centre then
                     if Index = 0 then
                        Front_Lot := L;
                     end if;
                     Index := Index - 1;
                  end if;
               end loop;
            end if;
            if not Legal_Front (Front_Lot) then
               Front_Lot := No_Id;
               for K in Integer_32 range 0 .. C.Blocks (Block).Lots - 1 loop
                  L := C.Blocks (Block).First_Lot + K;
                  if Front_Lot = No_Id and then Legal_Front (L) then
                     Front_Lot := L;
                  end if;
               end loop;
            end if;
            Front := C.Lots (Front_Lot).Building;
            Centre_Lot := No_Id;
            for K in Integer_32 range 0 .. C.Blocks (Block).Lots - 1 loop
               L := C.Blocks (Block).First_Lot + K;
               if Centre_Lot = No_Id and then C.Lots (L).Index = Centre then
                  Centre_Lot := L;
               end if;
            end loop;
            Hood.City.Replace_Building (C, Centre_Lot, T_Office, Office);
            exit when Office = No_Id;
            C.Buildings (Office).Id := S.Next_Id;
            S.Next_Id := S.Next_Id + 1;  --  the office takes the next number
            S.Extra (Office) := (Owner_Gang => G, Owner_Person | Manager | Hides => No_Id,
                                 Protect_Gang => 0, Protect_Weekly | Protect_Base => 0,
                                 Collected_Week => 0,
                                 Front_Of => Front, Is_HQ => True);
            S.Building_Count := C.Building_Count;
            S.Extra (Front).Owner_Gang := G;
            S.Extra (Front).Hides := Office;
            Count_Trading (S, C);
            Gang.Office := Office;
            Gang.Front := Front;
            if not C.Standard then
               C.HQ (G) := (Block => Block, Front => Front, Front_As => No_Kind, FX | FY => No_Id);
               C.HQ_Count := G;
            end if;
            S.People (Boss).Building := Office;
            S.People (Boss).X := C.Lots (Centre_Lot).CX;
            S.People (Boss).Y := C.Lots (Centre_Lot).CY;

            --  Five hoods and a lieutenant, all of the boss's heritage.
            for K in Hoods'Range loop
               Create (S, Main, R_Hood, C.Lots (Centre_Lot).CX, C.Lots (Centre_Lot).CY,
                       Hoods (K), Origin => Gang.Heritage, Business => K = 1, Gang => G);
               exit when Hoods (K) = No_Id;
               S.People (Hoods (K)).Demand := Pay_Demand (S.People (Hoods (K)), R_Hood);
               S.People (Hoods (K)).Pay := S.People (Hoods (K)).Demand;
            end loop;
            exit when S.Status /= Status_Ok;
            --  The first runs the front.
            Gang.Manager := Hoods (1);
            S.Extra (Front).Manager := Hoods (1);
            S.People (Hoods (1)).Building := Front;
            S.People (Hoods (1)).X := C.Lots (Front_Lot).CX;
            S.People (Hoods (1)).Y := C.Lots (Front_Lot).CY;
            --  The best organiser of the rest is lieutenant (a stable sort on
            --  organisation plus intelligence, best first).
            for K in 3 .. 6 loop
               declare
                  V : constant Integer_32 := Hoods (K);
                  Key : constant Integer_32 :=
                    Integer_32 (S.People (V).Skills (Organization)) + Integer_32 (S.People (V).Skills (Intelligence));
                  J : Integer := K - 1;
               begin
                  while J >= 2
                    and then Integer_32 (S.People (Hoods (J)).Skills (Organization))
                             + Integer_32 (S.People (Hoods (J)).Skills (Intelligence)) < Key
                  loop
                     Hoods (J + 1) := Hoods (J);
                     J := J - 1;
                  end loop;
                  Hoods (J + 1) := V;
               end;
            end loop;
            Hood.Population.Crews.New_Crew (S, G, Hoods (2), Crew);
            S.People (Hoods (2)).Demand := Pay_Demand (S.People (Hoods (2)), R_Lieutenant);
            S.People (Hoods (2)).Pay := S.People (Hoods (2)).Demand;
            S.Crews (Crew).Pistols := 1;
            S.Crews (Crew).Coupes := 1;
            Hood.Population.Crews.Add_Member (S, Crew, Hoods (3));
            for K in 4 .. 6 loop
               Join_Pool (G, Hoods (K));
            end loop;

            --  Starting rackets near the headquarters.
            if C.Standard then
               for K in Integer_32 range 0 .. C.Building_Count - 1 loop
                  Taken (K) := S.Extra (K).Owner_Gang /= 0 or else S.Extra (K).Protect_Gang /= 0
                    or else S.Extra (K).Is_HQ;
               end loop;
               Hood.City.Starting_Sites (C, G, Taken, Sixty, Count);
               for K in 1 .. Integer (Count) loop
                  Gang.Sites (K) := Sixty (K);
               end loop;
               Gang.Site_Count := Count;
            else
               Count := 0;
               for K in Integer_32 range 0 .. C.Block_Count - 1 loop
                  if abs (C.Blocks (K).GX - C.Blocks (Block).GX) <= 2
                    and then abs (C.Blocks (K).GY - C.Blocks (Block).GY) <= 2
                  then
                     for J in Integer_32 range 0 .. C.Blocks (K).Lots - 1 loop
                        L := C.Lots (C.Blocks (K).First_Lot + J).Building;
                        if Live (C, L)
                          and then Class_Of (C, L) not in Empty | Illegal | Municipal | Charity | Residential
                          and then S.Extra (L).Protect_Gang = 0
                          and then Count < Max_Sites
                        then
                           Count := Count + 1;
                           Choice (Integer (Count)) := L;
                        end if;
                     end loop;
                  end if;
               end loop;
               if Count > 0 then
                  Shuffle (Main, Choice (1 .. Integer (Count)));
               end if;
               for K in 1 .. Integer (Count) loop
                  Gang.Sites (K) := Choice (K);
               end loop;
               Gang.Site_Count := Count;
            end if;
            for K in 1 .. Integer (Integer_32'Min (2, Gang.Site_Count)) loop
               Protect (Gang.Sites (K), G);
            end loop;
         end;
      end loop;

      --  A gang's own front is no racket of its own or another's; keep the
      --  rest and fill each gang up to two from its list (citygen.ts:877-895).
      for K in Integer_32 range 0 .. C.Building_Count - 1 loop
         if S.Extra (K).Owner_Gang /= 0 and then S.Extra (K).Protect_Gang /= 0 then
            S.Extra (K).Protect_Gang := 0;
            S.Extra (K).Protect_Weekly := 0;
         end if;
      end loop;
      for G in Gang_Id loop
         Count := 2;
         for K in Integer_32 range 0 .. C.Building_Count - 1 loop
            if S.Extra (K).Protect_Gang = G then
               Count := Count - 1;
            end if;
         end loop;
         for K in 1 .. Integer (S.Gangs (G).Site_Count) loop
            exit when Count <= 0;
            L := S.Gangs (G).Sites (K);
            if S.Extra (L).Owner_Gang = 0 and then S.Extra (L).Protect_Gang = 0 then
               Protect (L, G);
               Count := Count - 1;
            end if;
         end loop;
      end loop;

      --  Peace all round; a rival opens toward the player at the stance of
      --  its starting hostility (aiStance.ts:83-91).
      for G in Gang_Id loop
         if S.Gangs (G).Profile >= 0 then
            Hostility := 122 + ((Rival_Profile (S.Gangs (G).Profile) (4) + 126) / 126) * 33;
            S.Gangs (G).Offered (1) :=
              (if Hostility < 156 then Peace elsif Hostility < 189 then Ceasefire
               elsif Hostility < 222 then Aggression else War);
            S.Gangs (1).Known (G) := S.Gangs (G).Offered (1);
         end if;
      end loop;

      --  Opinions of every gang, -6 .. 6, person by person.
      for P in Integer_32 range 0 .. S.Count - 1 loop
         for G in Gang_Id loop
            S.People (P).Opinion (G) := Integer_8 (Int (Main, -6, 6));
         end loop;
      end loop;

      --  Every member is offered his own wage quote.
      for G in Gang_Id loop
         declare
            procedure Quote (P : Integer_32) is
            begin
               if P /= No_Id then
                  S.People (P).Demand := Wage_Quote (S.People (P), G);
                  S.People (P).Pay := S.People (P).Demand;
               end if;
            end Quote;
         begin
            Quote (S.Gangs (G).Manager);
            for J in 1 .. Integer (S.Gangs (G).Crew_Total) loop
               Quote (S.Crews (S.Gangs (G).Crews (J)).Lieutenant);
               for K in 1 .. Integer (S.Crews (S.Gangs (G).Crews (J)).Count) loop
                  Quote (S.Crews (S.Gangs (G).Crews (J)).Members (K));
               end loop;
            end loop;
            for K in 1 .. Integer (S.Gangs (G).Pool_Count) loop
               Quote (S.Gangs (G).Pool (K));
            end loop;
         end;
      end loop;
   end Gangs;

   procedure Populate
     (S    : in out Population_State;
      C    : in out Hood.City.City_State;
      Main : in out Hood.Random.Mulberry)
   is
      Streets, Civics, Index, Blk, Other, Officers, Walkers : Integer_32;
      Blocks : constant Integer_32 := C.W * C.H;
      X, Y : Long_Float;

      procedure Civic_Spot is
         K : Integer_32;
      begin
         if Civics > 0 then
            K := Civic (Pick (Main, Civics));
         else
            K := Pick (Main, C.Block_Count);
         end if;
         Pavement (C.Blocks (K), S.Next_Id, X, Y);
      end Civic_Spot;

      procedure At_Lot (Building : Integer_32) is
      begin
         X := C.Lots (C.Buildings (Building).Lot).CX;
         Y := C.Lots (C.Buildings (Building).Lot).CY;
      end At_Lot;

   begin
      S.Count := 0;
      S.Status := Status_Ok;
      S.Next_Id := 1 + C.Lot_Count + C.Building_Count;
      S.Phase := Planning;
      S.Week := 1;
      S.Minute := 0;
      S.Game_Over := False;
      S.Draws_This_Week := 0;
      for K in Integer_32 range 0 .. C.Building_Count - 1 loop
         S.Extra (K) := (Owner_Gang | Protect_Gang => 0,
                         Protect_Weekly | Protect_Base | Collected_Week => 0,
                         Owner_Person | Manager | Front_Of | Hides => No_Id,
                         Is_HQ => False);
      end loop;
      S.Building_Count := C.Building_Count;
      S.Fleet_Count := 0;
      for K in S.Fleet'Range loop
         S.Fleet (K).Used := False;
      end loop;
      for K in S.Crews'Range loop
         S.Crews (K).Gang := 0;
         S.Crews (K).Count := 0;
         S.Crews (K).Order_Count := 0;
      end loop;
      for K in S.Orders'Range loop
         S.Orders (K).Gang := 0;
      end loop;
      S.Last_Count := 0;
      S.Message_Count := 0;
      S.City_Changed := False;
      Count_Trading (S, C);
      Streets := 0;
      Civics := 0;
      for K in Integer_32 range 0 .. C.Block_Count - 1 loop
         if C.Blocks (K).Merged_Into = No_Id and then Has_Footway (C, K) then
            Street (Streets) := K;
            Streets := Streets + 1;
            if C.Blocks (K).Area = Hood.Tables.Civic then
               Civic (Civics) := K;
               Civics := Civics + 1;
            end if;
         end if;
      end loop;

      --  Owners, priests and reporters (citygen.ts:544-559).
      for K in Integer_32 range 0 .. C.Building_Count - 1 loop
         if not C.Buildings (K).Removed then
            if Class_Of (C, K) in Commercial | Industrial | Tenement then
               At_Lot (K);
               Create (S, Main, R_Owner, X, Y, Index, Building => K);
               S.Extra (K).Owner_Person := Index;
            end if;
            if C.Buildings (K).Kind_Of in T_Church | T_Orphanage then
               At_Lot (K);
               Create (S, Main, R_Clergy, X, Y, Index, Building => K);
               S.Extra (K).Owner_Person := Index;
            end if;
            if C.Buildings (K).Kind_Of = T_Newspaper then
               At_Lot (K);
               Create (S, Main, R_Reporter, X, Y, Index, Building => K);
               S.Extra (K).Owner_Person := Index;
               for R in 1 .. 2 loop
                  Create (S, Main, R_Reporter, X, Y, Index, Building => K);
               end loop;
            end if;
         end if;
      end loop;

      --  Officials (citygen.ts:562-581).
      Civic_Spot;
      Create (S, Main, R_Mayor, X, Y, Index, Quality => 1.2);
      Civic_Spot;
      Create (S, Main, R_Police_Chief, X, Y, Index, Quality => 1.15);
      Civic_Spot;
      Create (S, Main, R_Fbi_Head, X, Y, Index, Quality => 1.35);
      for K in 1 .. 4 loop
         Civic_Spot;
         Create (S, Main, R_Judge, X, Y, Index, Quality => 1.1);
      end loop;
      for K in 1 .. 4 loop
         Civic_Spot;
         Create (S, Main, R_Da, X, Y, Index, Quality => 1.1);
      end loop;

      --  Police at the Standard city's density, 400 to 1,280 blocks,
      --  rounded half up (citygen.ts:585-591).
      Officers := (Blocks * 10 + 16) / 32;
      for K in 1 .. Officers loop
         Blk := Street (Pick (Main, Streets));
         Pavement (C.Blocks (Blk), S.Next_Id, X, Y);
         Create (S, Main, R_Police, X, Y, Index, Quality => 1.05);
      end loop;
      for K in 1 .. 5 loop
         Civic_Spot;
         Create (S, Main, R_Fbi, X, Y, Index, Quality => 1.3);
      end loop;
      for K in 1 .. 3 loop
         Blk := Street (Pick (Main, Streets));
         Pavement (C.Blocks (Blk), S.Next_Id, X, Y);
         Create (S, Main, R_Snitch, X, Y, Index);
      end loop;

      --  Citizens, 6,000 to 1,280 blocks; of two blocks the one with more
      --  trading lots (citygen.ts:599-607).
      Walkers := (Blocks * 150 + 16) / 32;
      for K in 0 .. Walkers - 1 loop
         Blk := Street (Pick (Main, Streets));
         Other := Street (Pick (Main, Streets));
         if S.Trading (Other) > S.Trading (Blk) then
            Blk := Other;
         end if;
         Pavement (C.Blocks (Blk), K, X, Y);
         Create (S, Main, R_Citizen, X, Y, Index);
      end loop;

      Top_Up (S, C, Main);
      Gangs (S, C, Main);
      S.Rng_After_Setup := State (Main);
      S.Rng_After_Minute_1 := 0;
   end Populate;

end Hood.Population.Setup;
